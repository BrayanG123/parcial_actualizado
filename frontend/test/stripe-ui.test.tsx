import { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PagoStripe from "../src/features/checkout/PagoStripe";

const sdk = vi.hoisted(() => ({
  confirmPayment: vi.fn(),
  elements: { submit: vi.fn() },
}));
vi.mock("@stripe/stripe-js/pure", () => ({
  loadStripe: () => Promise.resolve(sdk),
}));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: ReactNode }) => children,
  PaymentElement: ({ onReady }: { onReady: () => void }) => {
    useEffect(() => {
      onReady();
    }, [onReady]);
    return <div>Campos alojados por Stripe</div>;
  },
  useStripe: () => sdk,
  useElements: () => sdk.elements,
}));
let root: Root;
let container: HTMLDivElement;
const consultar = vi.fn();
beforeEach(() => {
  consultar.mockClear();
  sdk.confirmPayment.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function montar() {
  await act(async () =>
    root.render(
      <PagoStripe
        intento={{
          saleId: 71,
          clientSecret: "test_secret",
          publishableKey: "pk_test_example",
          status: "PENDING",
        }}
        saleId={71}
        onConsultar={consultar}
      />,
    ),
  );
}
async function pagar() {
  await act(async () => container.querySelector("button")!.click());
}
it("envia Elements a Stripe y espera al backend antes de mostrar la compra pagada", async () => {
  sdk.confirmPayment.mockResolvedValue({
    paymentIntent: { status: "succeeded" },
  });
  await montar();
  await pagar();
  expect(sdk.confirmPayment).toHaveBeenCalledWith({
    elements: sdk.elements,
    confirmParams: { return_url: `${window.location.origin}/mis-compras/71` },
    redirect: "if_required",
  });
  expect(consultar).toHaveBeenCalledOnce();
  expect(container.textContent).toContain(
    "Esperando la confirmacion de la tienda",
  );
  expect(container.textContent).not.toContain("Compra pagada");
});
it("muestra una tarjeta rechazada y permite corregir el pago", async () => {
  sdk.confirmPayment.mockResolvedValue({
    error: { message: "Tu tarjeta fue rechazada." },
  });
  await montar();
  await pagar();
  expect(container.querySelector("[role=alert]")?.textContent).toBe(
    "Tu tarjeta fue rechazada.",
  );
  expect(container.querySelector("button")!.disabled).toBe(false);
});
it("evita dos confirmaciones simultaneas y consulta el estado tras perder la respuesta", async () => {
  let rechazar!: () => void;
  sdk.confirmPayment.mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        rechazar = () => reject(new Error("network"));
      }),
  );
  await montar();
  await act(async () => {
    const form = container.querySelector("form")!;
    for (let i = 0; i < 2; i++)
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
  });
  expect(sdk.confirmPayment).toHaveBeenCalledOnce();
  await act(async () => rechazar());
  expect(consultar).toHaveBeenCalledOnce();
  expect(container.textContent).toContain(
    "Consulta el estado antes de volver a pagar",
  );
});
