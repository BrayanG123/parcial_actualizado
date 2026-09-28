import { act, type ReactNode } from "react";
import type { AxiosAdapter } from "axios";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ProductosProveedorReal from "../src/features/supplier/ProductosProveedorReal";
import EntregasProveedorReal from "../src/features/supplier/EntregasProveedorReal";
import PaginaUsuarios from "../src/features/admin/PaginaUsuarios";
import { ProveedorAuth } from "../src/context/AuthContext";
import { ProveedorToast } from "../src/context/ToastContext";
import { instancia } from "../src/api/http";
import { guardarToken } from "../src/api/sesion";
import { usuariosService } from "../src/services/organizacion.service";
import { respuesta, usuarioBackend } from "./fixtures";
import { prenda, pagina } from "./catalogo-fixtures";
import type { ProductoProveedor } from "../src/services/proveedor.service";

let root: Root;
let container: HTMLDivElement;
let qc: QueryClient;
let asociado: boolean;
let enviado: unknown;
let leidos: string[];
const propio: ProductoProveedor = {
  id: 1,
  name: "Camisa del proveedor",
  description: "Algodon",
  active: false,
  supplierAvailability: "10 unidades disponibles",
  seasonId: 6,
  collectionId: 7,
  season: prenda.season,
  collection: prenda.collection,
  category: prenda.category,
};
const perfil = () => ({
  ...usuarioBackend,
  client: null,
  supplier: asociado ? { id: 8, name: "Textiles", active: true } : null,
  roles: [{ role: { id: 5, name: "SUPPLIER", description: null } }],
});
beforeEach(() => {
  guardarToken("proveedor-test");
  asociado = true;
  enviado = undefined;
  leidos = [];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  instancia.defaults.adapter = async (c) => {
    leidos.push(c.url!);
    if (c.url === "/auth/me" || (c.url === "/users/12" && c.method === "get"))
      return respuesta(c, perfil());
    if (c.url === "/supplier/products") {
      expect(c.params.supplierId).toBeUndefined();
      return respuesta(c, pagina([propio]));
    }
    if (c.url === "/supplier/products/1" || c.url === "/users/12") {
      enviado = JSON.parse(c.data);
      return respuesta(c, c.url.startsWith("/users") ? perfil() : propio);
    }
    if (c.url === "/catalog/seasons")
      return respuesta(c, [
        prenda.season,
        { ...prenda.season, id: 60, name: "Invierno" },
      ]);
    if (c.url === "/catalog/collections")
      return respuesta(c, [
        prenda.collection,
        { ...prenda.collection, id: 70, seasonId: 60, name: "Abrigos" },
      ]);
    if (c.url === "/supplier/deliveries")
      return respuesta(
        c,
        pagina([
          {
            id: 9,
            quantity: 5,
            status: "COMPLETED",
            reference: "OC-9",
            occurredAt: "2026-09-12T12:00:00Z",
            scheduledAt: "2026-09-20T12:00:00Z",
            inventory: {
              product: { id: 1, name: propio.name },
              branch: { name: "Centro", city: "La Paz" },
              size: { name: "M" },
              color: { name: "Azul" },
            },
          },
        ]),
      );
    throw new Error(`Unexpected request ${c.url}`);
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
    await new Promise((r) => setTimeout(r, 45));
  });
}
async function montar(node: ReactNode = <ProductosProveedorReal />) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={qc}>
        <ProveedorAuth>
          <ProveedorToast>
            <MemoryRouter>{node}</MemoryRouter>
          </ProveedorToast>
        </ProveedorAuth>
      </QueryClientProvider>,
    ),
  );
  await esperar();
  await esperar();
}
async function click(text: string) {
  const b = [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text,
  )!;
  expect(b).toBeTruthy();
  await act(async () => b.click());
  await esperar();
}
async function select(element: HTMLSelectElement, value: string) {
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await esperar();
}
it("no consulta informacion del proveedor cuando la cuenta no esta asociada", async () => {
  asociado = false;
  await montar();
  expect(container.textContent).toContain(
    "Cuenta sin proveedor activo asociado",
  );
  expect(leidos).toEqual(["/auth/me"]);
});
it("edita solo campos autorizados y filtra colecciones por temporada", async () => {
  vi.spyOn(qc, "invalidateQueries").mockResolvedValue();
  await montar();
  expect(container.textContent).toContain("Camisa del proveedor");
  expect(container.textContent).toContain("Inactivo");
  await click("Editar ficha");
  const selects = document.querySelectorAll<HTMLSelectElement>(
    "[role=dialog] select",
  );
  await select(selects[0], "60");
  expect([...selects[1].options].map((o) => o.value)).toEqual(["", "70"]);
  await select(selects[1], "70");
  await click("Guardar ficha");
  expect(enviado).toEqual({
    name: propio.name,
    description: "Algodon",
    supplierAvailability: propio.supplierAvailability,
    seasonId: 60,
    collectionId: 70,
  });
  expect(qc.invalidateQueries).toHaveBeenCalledWith({
    queryKey: ["proveedor-productos"],
  });
  expect(qc.invalidateQueries).toHaveBeenCalledWith({
    queryKey: ["proveedor-disponibilidad"],
  });
});
it("consulta entregas propias sin usar los endpoints internos de inventario ni ofrecer recepcion", async () => {
  await montar(<EntregasProveedorReal />);
  expect(container.textContent).toContain("OC-9");
  expect(container.textContent).toContain("Recibida");
  expect(leidos.some((x) => x.startsWith("/inventory"))).toBe(false);
  expect(container.textContent).not.toContain("Confirmar recepcion");
});
it("el administrador puede conservar o quitar la asociacion enviando supplierId explicito", async () => {
  const updated = await usuariosService.actualizar(12, { id_proveedor: 8 });
  expect(enviado).toEqual({ supplierId: 8 });
  expect(updated.id_proveedor).toBe(8);
  await usuariosService.actualizar(12, { id_proveedor: null });
  expect(enviado).toEqual({ supplierId: null });
});
it("Usuarios permite elegir el proveedor al crear una cuenta con ese rol", async () => {
  qc.setQueryData(["roles"], [{ id_rol: 5, nombre: "PROVEEDOR" }]);
  qc.setQueryData(
    ["proveedores"],
    [{ id_proveedor: 8, nombre: "Textiles", activo: true }],
  );
  qc.setQueryData(["sucursales"], []);
  const original = instancia.defaults.adapter as AxiosAdapter;
  instancia.defaults.adapter = async (c) =>
    c.url === "/users" ? respuesta(c, pagina([])) : original(c);
  await montar(<PaginaUsuarios />);
  await click("Nuevo usuario");
  await click("PROVEEDOR");
  const selector = document.getElementById(
    "proveedor-usuario",
  ) as HTMLSelectElement;
  expect(selector).toBeTruthy();
  await select(selector, "8");
  expect(selector.value).toBe("8");
});
