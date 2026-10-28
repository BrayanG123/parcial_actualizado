/**
 * Reportes generativos en el movil (F8.6) para administrador y encargado.
 *
 * Voz: la app no agrega un modulo nativo de reconocimiento; se usa el dictado del teclado
 * del telefono (microfono de Gboard o del teclado de iOS), que escribe en el mismo campo.
 * Exportar: se comparte la tabla como CSV con la hoja de compartir del sistema.
 */
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Boton } from '../../components/Boton';
import { Campo } from '../../components/Campo';
import { ErrorVista, Vacio } from '../../components/Estados';
import { Insignia } from '../../components/Insignias';
import { Pantalla } from '../../components/Pantalla';
import { Chip } from '../../components/Selectores';
import { reportesService } from '../../services/reportes.service';
import { colores, esp, radio, texto } from '../../theme';
import { GraficoNativo } from './GraficoNativo';
import { aCsv, datosGrafico, EJEMPLOS_REPORTE, formatoCelda, type ReporteMovil } from './modelo';

export function PantallaReportesIA() {
  const [pregunta, setPregunta] = useState('');
  const reporte = useMutation({ mutationFn: reportesService.generar });
  const scroll = useRef<ScrollView>(null);
  const posicionResultado = useRef(0);
  // Al llegar un reporte se lleva la vista al resultado (el formulario queda arriba).
  useEffect(() => {
    if (reporte.data) scroll.current?.scrollTo({ y: Math.max(0, posicionResultado.current - esp.m), animated: true });
  }, [reporte.data]);

  function generar(texto = pregunta) {
    const limpio = texto.trim();
    if (limpio.length < 3 || reporte.isPending) return;
    setPregunta(limpio);
    reporte.mutate(limpio);
  }

  return (
    <Pantalla>
      <ScrollView ref={scroll} contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        <Text style={texto.etiqueta}>INTELIGENCIA ARTIFICIAL</Text>
        <Text style={texto.titulo}>Reportes por voz o texto</Text>
        <Text style={texto.cuerpo}>
          Pide un reporte en lenguaje natural. Los datos los calcula el servidor con tus permisos.
        </Text>
        <Campo
          etiqueta="Solicitud"
          value={pregunta}
          onChangeText={setPregunta}
          placeholder="Ej.: ventas por sucursal de este mes"
          maxLength={300}
          multiline
          returnKeyType="send"
          onSubmitEditing={() => generar()}
          ayuda="Para dictar, toca el microfono de tu teclado."
        />
        <Boton
          titulo={reporte.isPending ? 'Generando...' : 'Generar reporte'}
          icono="sparkles-outline"
          cargando={reporte.isPending}
          deshabilitado={pregunta.trim().length < 3}
          ancho
          onPress={() => generar()}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.ejemplos}>
          {EJEMPLOS_REPORTE.map((e) => (
            <Chip key={e} texto={e} deshabilitado={reporte.isPending} onPress={() => generar(e)} />
          ))}
        </ScrollView>

        <View onLayout={(e) => (posicionResultado.current = e.nativeEvent.layout.y)} style={{ gap: esp.m }}>
          {reporte.isError && <ErrorVista error={reporte.error} onReintentar={() => generar()} />}
          {reporte.data && <Resultado r={reporte.data} onElegir={generar} />}
        </View>
        {!reporte.data && !reporte.isError && !reporte.isPending && (
          <Vacio icono="bar-chart-outline" titulo="Sin reporte" detalle="Escribe o dicta una solicitud." />
        )}
      </ScrollView>
    </Pantalla>
  );
}

function Resultado({ r, onElegir }: { r: ReporteMovil; onElegir: (pregunta: string) => void }) {
  const origen = r.origen === 'rules' ? 'Reglas (sin IA)' : 'IA';
  if (r.estado !== 'OK')
    return (
      <View style={estilos.tarjeta}>
        <View style={estilos.cabecera}>
          <Text style={texto.subtitulo}>
            {r.estado === 'ACLARACION' ? 'Necesito una aclaracion' : 'Solicitud no disponible'}
          </Text>
          <Insignia texto={origen} />
        </View>
        <Text style={texto.cuerpo}>{r.resumen}</Text>
        {r.sugerencias.length > 0 && <Text style={texto.menor}>Puedes pedir, por ejemplo:</Text>}
        <View style={estilos.chips}>
          {r.sugerencias.map((s) => (
            <Chip key={s} texto={s} onPress={() => onElegir(s)} />
          ))}
        </View>
      </View>
    );

  const grafico = datosGrafico(r);
  return (
    <>
      <View style={estilos.tarjeta}>
        <View style={estilos.cabecera}>
          <Text style={texto.subtitulo}>Interpretacion</Text>
          <Insignia texto={origen} tono={r.origen === 'rules' ? 'neutro' : 'info'} />
        </View>
        <Text style={texto.cuerpo}>{r.explicacion}</Text>
        <View style={estilos.chips}>
          {r.filtros.map((f) => (
            <Insignia key={f} texto={f} />
          ))}
        </View>
        <View style={estilos.resumen}>
          <Text style={texto.cuerpo}>{r.resumen}</Text>
        </View>
      </View>

      <View style={estilos.tarjeta}>
        <Text style={texto.subtitulo}>{r.grafico.titulo}</Text>
        {r.filas.length === 0 ? (
          <Text style={texto.cuerpo}>No hay datos con esos filtros.</Text>
        ) : (
          <>
            <GraficoNativo datos={grafico} />
            <Tabla r={r} />
            <Boton
              titulo="Compartir como CSV"
              variante="secundario"
              icono="share-outline"
              ancho
              onPress={() => void Share.share({ title: r.grafico.titulo, message: aCsv(r) })}
            />
          </>
        )}
      </View>
    </>
  );
}

function Tabla({ r }: { r: Extract<ReporteMovil, { estado: 'OK' }> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View>
        <View style={[estilos.filaTabla, estilos.encabezado]}>
          {r.columnas.map((c) => (
            <Text key={c.clave} style={[estilos.celda, texto.etiqueta, c.formato !== 'text' && estilos.numero]}>
              {c.titulo.toUpperCase()}
            </Text>
          ))}
        </View>
        {r.filas.map((f, i) => (
          <View key={i} style={estilos.filaTabla}>
            {r.columnas.map((c) => (
              <Text key={c.clave} style={[estilos.celda, texto.cuerpo, c.formato !== 'text' && estilos.numero]} numberOfLines={2}>
                {formatoCelda(f[c.clave], c.formato)}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: esp.l, gap: esp.m, paddingBottom: esp.xxxl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: esp.s },
  ejemplos: { gap: esp.s, paddingRight: esp.l },
  tarjeta: {
    backgroundColor: colores.blanco,
    borderRadius: radio.l,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: esp.l,
    gap: esp.m,
  },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: esp.s },
  resumen: { backgroundColor: colores.crema2, borderRadius: radio.m, padding: esp.m },
  filaTabla: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colores.borde, paddingVertical: esp.s },
  encabezado: { borderBottomColor: colores.bordeFuerte },
  celda: { width: 120, paddingHorizontal: esp.xs },
  numero: { textAlign: 'right' },
});
