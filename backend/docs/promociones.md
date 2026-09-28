# Actualizacion de fechas de promocion

`PATCH /api/v1/products/:id` (administrador):

- Omitir `promotionStart` o `promotionEnd` conserva el valor existente.
- Enviar `null` borra la fecha. Para quitar el periodo completo, enviar ambas:

```json
{
  "promotionStart": null,
  "promotionEnd": null
}
```

El periodo resultante debe tener ambas fechas o ninguna. Borrar solo una fecha
dejando la otra establecida devuelve 400. Se puede modificar una fecha sin
reenviar la otra, siempre que el inicio no sea posterior al fin.

Eliminar las fechas no modifica `discountPercent`, pero la promocion deja de
aplicarse: `promotionActive` es `false` y `currentPrice` vuelve al precio base.
Para borrar tambien el porcentaje se puede enviar `discountPercent: 0`.
No se necesita una migracion: las columnas ya admiten valores nulos.
