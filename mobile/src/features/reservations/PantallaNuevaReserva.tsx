/**
 * Nueva reserva para probar prendas en sucursal.
 *
 *   prendas -> sucursal -> horario -> revision -> confirmacion
 *
 * El horario se elige con dia + franja horaria en lugar de un selector nativo:
 * evita una dependencia mas y se ajusta al horario real de atencion.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Boton } from '../../components/Boton';
import { AvisoEnLinea, Vacio } from '../../components/Estados';
import { ImagenProducto } from '../../components/ImagenProducto';
import { Pantalla } from '../../components/Pantalla';
import { RequiereSesion } from '../../components/RequiereSesion';
import { Chip, Contador } from '../../components/Selectores';
import { useAvisos } from '../../context/AvisosContext';
import { useSesion } from '../../context/SesionContext';
import { useSucursales } from '../../hooks/useCatalogo';
import { useStockReserva } from '../../hooks/useStockReserva';
import { useCrearReserva } from '../../hooks/useComercio';
import { fechaRelativa, plural } from '../../lib/format';
import type { PropsStack } from '../../navigation/tipos';
import { colores, esp, radio, texto } from '../../theme';
import { useBorradorReserva } from './BorradorReserva';

/** Horario de atencion de las tiendas. */
const FRANJAS = ['10:00', '11:00', '12:00', '15:00', '16:00', '17:00', '18:00', '19:00'];
const DIAS_OFRECIDOS = 5;

function proximosDias(): Date[] {
  const hoy = new Date();
  return Array.from({ length: DIAS_OFRECIDOS }, (_, i) => {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() + i);
    d.setHours(0, 0, 0, 0);
    return d;
  });
}

export function PantallaNuevaReserva({ navigation }: PropsStack<'NuevaReserva'>) {
  const { autenticado } = useSesion();
  const { avisar, avisarError } = useAvisos();
  const borrador = useBorradorReserva();
  const { data: sucursales } = useSucursales();
  const crear = useCrearReserva();

  const dias = useMemo(() => proximosDias(), []);
  const [dia, setDia] = useState<Date>(dias[0]);
  const [franja, setFranja] = useState<string>();
  const [idSucursal, setIdSucursal] = useState<number>();
  const [observacion, setObservacion] = useState('');
  const [error, setError] = useState<string | null>(null);

  const stock = useStockReserva(borrador.lineas, idSucursal, autenticado);

  if (!autenticado) {
    return (
      <Pantalla bordes={['bottom']}>
        <RequiereSesion
          titulo="Reserva para probarte"
          detalle="Inicia sesion para apartar prendas en la sucursal que elijas."
          onAcceder={() => navigation.navigate('Acceso', { motivo: 'Inicia sesion para reservar prendas.' })}
        />
      </Pantalla>
    );
  }

  if (borrador.lineas.length === 0) {
    return (
      <Pantalla bordes={['bottom']}>
        <Vacio
          icono="calendar-outline"
          titulo="Sin prendas en la reserva"
          detalle="Abre una prenda del catalogo, elige talla y color, y toca Reservar para probar en tienda."
          accion={{ titulo: 'Ir al catalogo', onPress: () => navigation.navigate('Tabs') }}
        />
      </Pantalla>
    );
  }

  const unidades = borrador.lineas.reduce((acc, l) => acc + l.cantidad, 0);

  async function confirmar() {
    if (!idSucursal) return setError('Elige la sucursal donde te probaras las prendas.');
    if (!franja) return setError('Elige un horario aproximado de visita.');
    if (!stock.confirmable) return setError('Revisa la disponibilidad de las prendas antes de confirmar.');
    setError(null);

    const [hora, minuto] = franja.split(':').map(Number);
    const horario = new Date(dia);
    horario.setHours(hora, minuto, 0, 0);

    try {
      const reserva = await crear.mutateAsync({
        id_sucursal: idSucursal,
        horario_aproximado: horario.toISOString(),
        observacion: observacion.trim(),
        detalles: borrador.lineas.map((l) => ({
          id_producto: l.id_producto,
          id_talla: l.id_talla,
          id_color: l.id_color,
          cantidad: l.cantidad,
        })),
      });
      borrador.vaciar();
      avisar('Reserva creada. Te esperamos en tienda.');
      navigation.replace('DetalleReserva', { id: reserva.id_reserva });
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : 'No pudimos crear la reserva.';
      setError(mensaje);
      avisarError(e);
    }
  }

  return (
    <Pantalla bordes={['bottom']}>
      <ScrollView contentContainerStyle={estilos.contenido} showsVerticalScrollIndicator={false}>
        <View style={estilos.bloque}>
          <Text style={estilos.titulo}>Prendas a probar</Text>
          <Text style={estilos.detalle}>{plural(unidades, 'prenda', 'prendas')}</Text>
          {borrador.lineas.map((l, indice) => (
            <View key={l.clave} style={estilos.linea}>
              <ImagenProducto url={l.imagen_url} claveReciclado={l.clave} estilo={estilos.miniatura} />
              <View style={estilos.lineaCuerpo}>
                <Text style={estilos.lineaNombre} numberOfLines={2}>
                  {l.nombre}
                </Text>
                <Text style={estilos.detalle}>
                  Talla {l.talla} - {l.color}
                </Text>
                {idSucursal ? (
                  <Text style={[estilos.detalle, stock.estados[indice].estado === 'insuficiente' && { color: colores.acento }]}>
                    {stock.estados[indice].estado === 'consultando' ? 'Consultando disponibilidad...'
                      : stock.estados[indice].estado === 'error' ? 'No se pudo consultar el stock.'
                      : stock.estados[indice].estado === 'insuficiente'
                        ? stock.estados[indice].disponible === 0
                          ? 'No disponible en esta sucursal. Quita la prenda o cambia de sucursal.'
                          : `Solo ${stock.estados[indice].disponible} disponibles. Reduce la cantidad.`
                        : `${stock.estados[indice].disponible} disponibles en esta sucursal.`}
                  </Text>
                ) : null}
                <View style={estilos.lineaAcciones}>
                  <Contador
                    valor={l.cantidad}
                    compacto
                    max={5}
                    onCambiar={(c) => borrador.cambiarCantidad(l.clave, c)}
                  />
                  <Pressable
                    onPress={() => borrador.quitar(l.clave)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Quitar prenda de la reserva"
                  >
                    <Ionicons name="trash-outline" size={18} color={colores.tinta3} />
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
          <Boton
            titulo="Agregar otra prenda"
            icono="add"
            variante="plano"
            tamano="compacto"
            onPress={() => navigation.navigate('Tabs')}
          />
        </View>

        <View style={estilos.bloque}>
          <Text style={estilos.titulo}>Sucursal</Text>
          <View style={estilos.opciones}>
            {(sucursales ?? []).map((s) => (
              <Chip
                key={s.id_sucursal}
                texto={`${s.nombre.replace('FashionStore ', '')} - ${s.ciudad}`}
                activo={idSucursal === s.id_sucursal}
                onPress={() => { setIdSucursal(s.id_sucursal); setError(null); }}
              />
            ))}
          </View>
          {idSucursal ? (
            <Boton titulo={stock.error ? 'Reintentar disponibilidad' : 'Actualizar disponibilidad'}
              variante="plano" tamano="compacto" cargando={stock.consultando}
              onPress={() => { void stock.refrescar(); }} />
          ) : null}
          <Text style={estilos.detalle}>
            Solo se reservan las prendas con stock disponible en la sucursal elegida.
          </Text>
        </View>

        <View style={estilos.bloque}>
          <Text style={estilos.titulo}>Dia de tu visita</Text>
          <View style={estilos.opciones}>
            {dias.map((d) => (
              <Chip
                key={d.toISOString()}
                texto={fechaRelativa(d)}
                activo={dia.getTime() === d.getTime()}
                onPress={() => setDia(d)}
              />
            ))}
          </View>

          <Text style={[estilos.titulo, estilos.espacioArriba]}>Horario aproximado</Text>
          <View style={estilos.opciones}>
            {FRANJAS.map((f) => (
              <Chip key={f} texto={f} activo={franja === f} onPress={() => setFranja(f)} />
            ))}
          </View>
        </View>

        <View style={estilos.bloque}>
          <Text style={estilos.titulo}>Nota para la tienda</Text>
          <TextInput
            value={observacion}
            onChangeText={setObservacion}
            placeholder="Por ejemplo: quiero comparar dos tallas del mismo vestido."
            placeholderTextColor={colores.tinta3}
            multiline
            numberOfLines={3}
            maxLength={200}
            style={estilos.nota}
          />
        </View>

        {error ? <AvisoEnLinea texto={error} /> : null}
      </ScrollView>

      <View style={estilos.pie}>
        <Text style={estilos.resumen}>
          {idSucursal && franja
            ? `${fechaRelativa(dia)} a las ${franja}`
            : 'Elige sucursal y horario para confirmar'}
        </Text>
        <Boton titulo="Confirmar reserva" ancho onPress={confirmar} cargando={crear.isPending} deshabilitado={!stock.confirmable || !franja} />
      </View>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: esp.l, gap: esp.xl, paddingBottom: esp.xl },
  bloque: { gap: esp.s },
  titulo: { ...texto.subtitulo },
  detalle: { ...texto.menor },
  espacioArriba: { marginTop: esp.m },
  linea: {
    flexDirection: 'row',
    gap: esp.m,
    padding: esp.m,
    backgroundColor: colores.blanco,
    borderRadius: radio.m,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  miniatura: { width: 60, height: 80 },
  lineaCuerpo: { flex: 1, gap: 3 },
  lineaNombre: { ...texto.cuerpo, fontWeight: '600', color: colores.tinta },
  lineaAcciones: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: esp.xs,
  },
  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: esp.s },
  nota: {
    ...texto.cuerpo,
    color: colores.tinta,
    backgroundColor: colores.blanco,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radio.m,
    padding: esp.m,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  pie: {
    paddingHorizontal: esp.l,
    paddingTop: esp.m,
    paddingBottom: esp.m,
    borderTopWidth: 1,
    borderTopColor: colores.borde,
    backgroundColor: colores.blanco,
    gap: esp.s,
  },
  resumen: { ...texto.menor, textAlign: 'center' },
});
