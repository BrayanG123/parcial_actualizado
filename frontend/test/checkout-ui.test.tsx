import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProveedorAuth } from "../src/context/AuthContext";
import CheckoutReal from "../src/features/checkout/CheckoutReal";
import DetallePedido from "../src/features/checkout/DetallePedido";
import { instancia } from "../src/api/http";
import { guardarToken } from "../src/api/sesion";
import { recuperarPedido, guardarPedido } from "../src/lib/checkout";
import type { PedidoCheckout } from "../src/services/checkout.service";
import { respuesta, rechazo, usuarioBackend } from "./fixtures";
import { carrito } from "./operaciones-fixtures";
import { cotizacion, venta } from "./pos-fixtures";
import { turno } from "./turnos-fixtures";

vi.mock("../src/features/checkout/PagoStripe", () => ({
  default: () => <p>Formulario seguro Stripe</p>,
}));
let root: Root;
let container: HTMLDivElement;
let qc: QueryClient;
let modo: "ok" | "network" | "conflict";
let enviados: PedidoCheckout[];
let actual = { ...venta };
let staff: boolean;
let sinStripe: boolean;
let entregas: unknown[];
const datos: PedidoCheckout = {
  cartId: 30,
  branchId: 2,
  quoteHash: "a".repeat(64),
  channel: "WEB",
  paymentOption: "STRIPE",
  idempotencyKey: "fd893bb1-f65f-4f03-8a94-7975619a489c",
};
beforeEach(() => {
  sessionStorage.clear();
  guardarToken("checkout-test");
  modo = "ok";
  enviados = [];
  staff = false;
  sinStripe = false;
  entregas = [];
  actual = {
    ...venta,
    channel: "WEB",
    status: "PENDING_PAYMENT",
    expiresAt: "2100-01-01T00:00:00Z",
    payments: [
      {
        ...venta.payments[0],
        method: "GATEWAY",
        type: "ELECTRONIC",
        status: "PENDING",
      },
    ],
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  instancia.defaults.adapter = async (c) => {
    if (c.url === "/auth/me")
      return respuesta(
        c,
        staff
          ? {
              ...usuarioBackend,
              roles: [
                { role: { id: 1, name: "ADMINISTRATOR", description: null } },
              ],
              client: null,
            }
          : usuarioBackend,
      );
    if (c.url === "/cart") return respuesta(c, carrito);
    if (c.url === "/payments/stripe/config") {
      if (sinStripe) throw rechazo(c, 503, "Stripe is not configured");
      return respuesta(c, { publishableKey: "pk_test_example", mode: "test" });
    }
    if (c.url === "/sales/checkout/preview")
      return respuesta(c, {
        ...cotizacion,
        cartId: 30,
        quoteHash: datos.quoteHash,
      });
    if (c.url === "/sales/checkout") {
      enviados.push(JSON.parse(c.data));
      expect(recuperarPedido(12)).toEqual(enviados.at(-1));
      if (modo === "network") throw new Error("network");
      if (modo === "conflict")
        throw rechazo(
          c,
          409,
          "Cart or prices changed; request a new checkout preview",
        );
      return respuesta(c, actual);
    }
    if (c.url === "/sales/71") return respuesta(c, actual);
    if (c.url === "/payments/stripe/intents") {
      expect(JSON.parse(c.data)).toEqual({ saleId: 71 });
      return respuesta(c, {
        saleId: 71,
        clientSecret: "test_secret",
        publishableKey: "pk_test_example",
        status: "PENDING",
      });
    }
    if (c.url === "/cash/shifts/current") return respuesta(c, turno);
    if (c.url === "/sales/71/deliver") {
      entregas.push(JSON.parse(c.data));
      actual = {
        ...actual,
        status: "COMPLETED",
        deliveredAt: "2026-09-12T20:00:00Z",
      };
      return respuesta(c, actual);
    }
    if (c.url === "/sales/71/receipt") return respuesta(c, actual);
    throw new Error(`Unexpected request: ${c.url}`);
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  qc.clear();
  container.remove();
  vi.restoreAllMocks();
});
async function esperar() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}
async function montar(detalle = false) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={qc}>
        <ProveedorAuth>
          <MemoryRouter initialEntries={["/checkout"]}>
            <Routes>
              <Route
                path="/checkout"
                element={
                  detalle ? (
                    <DetallePedido id={71} operacion={staff} />
                  ) : (
                    <CheckoutReal />
                  )
                }
              />
              <Route path="/mis-compras/:id" element={<p>Pedido creado</p>} />
            </Routes>
          </MemoryRouter>
        </ProveedorAuth>
      </QueryClientProvider>,
    ),
  );
  await esperar();
  await esperar();
}
async function click(texto: string) {
  const btn = Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent === texto,
  )!;
  expect(btn).toBeTruthy();
  await act(async () => btn.click());
  await esperar();
}
async function seleccionar() {
  const select = container.querySelector("select")!;
  await act(async () => {
    select.value = "2";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await esperar();
}
async function submit() {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await esperar();
}

it("confirma el total del backend y recupera el mismo pedido tras perder la respuesta y recargar", async () => {
  modo = "network";
  await montar();
  await seleccionar();
  await submit();
  expect(enviados).toHaveLength(1);
  const original = enviados[0];
  expect(original).toMatchObject({
    cartId: 30,
    branchId: 2,
    quoteHash: datos.quoteHash,
    channel: "WEB",
    paymentOption: "STRIPE",
  });
  await act(async () => root.unmount());
  root = createRoot(container);
  modo = "ok";
  await montar();
  expect(container.textContent).toContain("Recuperar pedido");
  await click("Reintentar pedido");
  expect(enviados[1]).toEqual(original);
  expect(recuperarPedido(12)).toBeNull();
  expect(container.textContent).toContain("Pedido creado");
});
it("un conflicto libera el intento para revisar precios sin crear otra venta automaticamente", async () => {
  modo = "conflict";
  await montar();
  await seleccionar();
  await submit();
  expect(recuperarPedido(12)).toBeNull();
  expect(enviados).toHaveLength(1);
  expect(container.textContent).toContain("Finalizar compra");
});
it("contra entrega permanece disponible sin Stripe y envia los datos del destinatario", async () => {
  sinStripe = true;
  await montar();
  await seleccionar();
  const radios =
    container.querySelectorAll<HTMLInputElement>("input[type=radio]");
  await act(async () => radios[1].click());
  const campos = container.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement
  >("input:not([type=radio]), textarea");
  for (const [i, value] of [
    "Ana Cliente",
    "76543210",
    "La Paz, avenida 123 puerta azul",
  ].entries()) {
    const input = campos[i];
    await act(async () => {
      const prototype =
        input instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
        input,
        value,
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  await submit();
  expect(enviados[0]).toMatchObject({
    paymentOption: "CASH_ON_DELIVERY",
    deliveryName: "Ana Cliente",
    deliveryPhone: "76543210",
    deliveryAddress: "La Paz, avenida 123 puerta azul",
  });
});
it("el pedido pendiente permite retomar Stripe sin generar otra venta ni aprobarla desde React", async () => {
  await montar(true);
  await click("Abrir pago con Stripe");
  await esperar();
  expect(container.textContent).toContain("Formulario seguro Stripe");
  expect(container.textContent).toContain("Pago pendiente");
  expect(enviados).toHaveLength(0);
  expect(sessionStorage.length).toBe(0);
});
it("el empleado confirma contra entrega solo tras aceptar el importe en su turno", async () => {
  staff = true;
  actual = {
    ...actual,
    cashOnDelivery: true,
    expiresAt: null,
    deliveryName: "Ana",
    deliveryPhone: "76543210",
    deliveryAddress: "Direccion de entrega",
  };
  await montar(true);
  await click("Registrar entrega y cobro");
  expect(entregas).toHaveLength(0);
  await click("Confirmar efectivo recibido");
  expect(entregas).toEqual([{ shiftId: turno.id, expectedTotal: 160 }]);
  expect(container.textContent).toContain("Entregado y cobrado");
});
it("los pedidos guardados pertenecen a la cuenta que los creo", () => {
  guardarPedido(12, datos);
  expect(recuperarPedido(13)).toBeNull();
});
