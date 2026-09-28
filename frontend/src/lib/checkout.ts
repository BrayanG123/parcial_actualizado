import { BASE_URL } from "../api/config";
import type { PedidoCheckout } from "../services/checkout.service";

const clave = (userId: number) => `fs.checkout.v1:${BASE_URL}:${userId}`;
export function recuperarPedido(userId: number): PedidoCheckout | null {
  const raw = sessionStorage.getItem(clave(userId));
  if (!raw) return null;
  const value = JSON.parse(raw) as PedidoCheckout;
  if (
    !value?.idempotencyKey ||
    !value.quoteHash ||
    !Number.isInteger(value.cartId)
  )
    throw new Error(
      "No se pudo recuperar el pedido. Revisa Mis compras antes de continuar.",
    );
  return value;
}
export function guardarPedido(userId: number, value: PedidoCheckout) {
  // Persist before sending. Never store card details or Stripe client secrets.
  sessionStorage.setItem(clave(userId), JSON.stringify(value));
}
export function borrarPedido(userId: number) {
  sessionStorage.removeItem(clave(userId));
}
