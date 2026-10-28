/** Grafico dibujado con Views (sin librerias nativas) a partir de la especificacion del backend. */
import { StyleSheet, Text, View } from 'react-native';
import { colores, esp, radio, texto } from '../../theme';
import { formatoCelda, type DatosGrafico } from './modelo';

const PALETA = [colores.acento, colores.info, '#c58b2b', colores.exito, '#6b4e8c', '#8c6b4e'];

export function GraficoNativo({ datos }: { datos: DatosGrafico }) {
  if (datos.tipo === 'tabla') return null;
  const leyenda =
    datos.series.length > 1 ? (
      <View style={estilos.leyenda}>
        {datos.series.map((s, i) => (
          <View key={s.clave} style={estilos.itemLeyenda}>
            <View style={[estilos.muestra, { backgroundColor: PALETA[i % PALETA.length] }]} />
            <Text style={texto.menor}>{s.titulo}</Text>
          </View>
        ))}
      </View>
    ) : null;

  if (datos.tipo === 'proporcion')
    return (
      <View accessibilityLabel="Grafico de participacion" style={{ gap: esp.s }}>
        <View style={estilos.barraTotal}>
          {datos.partes.map((p, i) => (
            <View key={p.etiqueta} style={{ flex: Math.max(p.porcentaje, 0.5), backgroundColor: PALETA[i % PALETA.length] }} />
          ))}
        </View>
        {datos.partes.map((p, i) => (
          <View key={p.etiqueta} style={estilos.fila}>
            <View style={[estilos.muestra, { backgroundColor: PALETA[i % PALETA.length] }]} />
            <Text style={[texto.cuerpo, { flex: 1 }]} numberOfLines={1}>
              {p.etiqueta}
            </Text>
            <Text style={texto.cuerpo}>{p.porcentaje}%</Text>
          </View>
        ))}
      </View>
    );

  if (datos.tipo === 'columnas')
    return (
      <View accessibilityLabel="Grafico de columnas" style={{ gap: esp.s }}>
        <View style={estilos.columnas}>
          {datos.barras.map((b) => (
            <View key={b.etiqueta} style={estilos.grupoColumna}>
              <View style={estilos.columnasGrupo}>
                {b.valores.map((v, i) => (
                  <View
                    key={v.serie}
                    style={[estilos.columna, { height: `${Math.max(2, v.proporcion * 100)}%`, backgroundColor: PALETA[i % PALETA.length] }]}
                  />
                ))}
              </View>
              <Text style={estilos.etiquetaColumna} numberOfLines={1}>
                {/^\d{4}-/.test(b.etiqueta) ? b.etiqueta.slice(5) : b.etiqueta}
              </Text>
            </View>
          ))}
        </View>
        {leyenda}
        {datos.omitidas > 0 && <Text style={texto.menor}>Se grafican los ultimos {datos.barras.length} periodos; el resto esta en la tabla.</Text>}
      </View>
    );

  return (
    <View accessibilityLabel="Grafico de barras" style={{ gap: esp.m }}>
      {datos.barras.map((b) => (
        <View key={b.etiqueta} style={{ gap: 4 }}>
          <Text style={texto.cuerpo} numberOfLines={1}>
            {b.etiqueta}
          </Text>
          {b.valores.map((v, i) => (
            <View key={v.serie} style={estilos.fila}>
              <View style={estilos.pista}>
                <View style={[estilos.barra, { width: `${Math.max(1, v.proporcion * 100)}%`, backgroundColor: PALETA[i % PALETA.length] }]} />
              </View>
              <Text style={[texto.menor, estilos.valor]}>{formatoCelda(v.valor, datos.formato)}</Text>
            </View>
          ))}
        </View>
      ))}
      {leyenda}
      {datos.omitidas > 0 && <Text style={texto.menor}>{datos.omitidas} filas mas en la tabla.</Text>}
    </View>
  );
}

const estilos = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: esp.s },
  pista: { flex: 1, height: 12, borderRadius: radio.s, backgroundColor: colores.crema2, overflow: 'hidden' },
  barra: { height: '100%', borderRadius: radio.s },
  valor: { minWidth: 92, textAlign: 'right' },
  barraTotal: { flexDirection: 'row', height: 20, borderRadius: radio.s, overflow: 'hidden' },
  muestra: { width: 12, height: 12, borderRadius: 3 },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: esp.m },
  itemLeyenda: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  columnas: { flexDirection: 'row', alignItems: 'flex-end', height: 160, gap: 4 },
  grupoColumna: { flex: 1, alignItems: 'center', height: '100%' },
  columnasGrupo: { flex: 1, width: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 1 },
  columna: { flex: 1, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  etiquetaColumna: { fontSize: 9, color: colores.tinta3, marginTop: 2 },
});
