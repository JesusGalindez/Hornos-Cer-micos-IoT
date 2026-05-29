import mqtt from 'mqtt';
import pool from '../config/base_datos';

// Datos de conexión al broker MQTT en la nube de HiveMQ vía WebSockets Seguros (wss)
const BROKER_URL = 'wss://624fe0b39ecc4aa4b5f551f2fd50a353.s1.eu.hivemq.cloud:443/mqtt';
const DISPOSITIVO_ID = 'b4578e9b-0081-42ab-ba41-d68a994abfe2';

// Credenciales del backend / dispositivo creadas en HiveMQ
const MQTT_USUARIO = 'sistema_backend';
const MQTT_CONTRASENA = 'Token_backend_sistema_9988';

// ============================================================================
// CONFIGURACIÓN DE LA CURVA DE PORCELANA CHINA DE ALTA TEMPERATURA (15 MINUTOS)
// ============================================================================
let programaQuema: any[] = [
  { paso: 1, tipo: 'Rampa a 200°C', duracion_seg: 180, temp_final: 200.0, estado_horno: 1 },    // 3 minutos
  { paso: 2, tipo: 'Meseta de 200°C', duracion_seg: 300, temp_final: 200.0, estado_horno: 1 },  // 5 minutos
  { paso: 3, tipo: 'Rampa a 500°C', duracion_seg: 240, temp_final: 500.0, estado_horno: 1 },    // 4 minutos
  { paso: 4, tipo: 'Meseta de 500°C', duracion_seg: 300, temp_final: 500.0, estado_horno: 1 },  // 5 minutes
  { paso: 5, tipo: 'Rampa a 800°C', duracion_seg: 240, temp_final: 800.0, estado_horno: 1 },    // 4 minutos
  { paso: 6, tipo: 'Meseta de 800°C', duracion_seg: 300, temp_final: 800.0, estado_horno: 1 },  // 5 minutos
  { paso: 7, tipo: 'Rampa Final a 1300°C', duracion_seg: 240, temp_final: 1300.0, estado_horno: 1 } // 4 minutos
];

// Variables iniciales físicas declaradas a nivel global (Ámbito completo)
let temperaturaActual = 20.0;
let tempInicialPaso = 20.0;
let pasoActualIdx = 0;
let tiempoEnPaso = 0;
let totalPasos = programaQuema.length;
let quemaFinalizada = false;
let quemaIniciada = false; 
let horaInicioProgramada: Date | null = null;
let tiempoTotalTranscurrido = 0;
let totalDuracionProgramaSeg = programaQuema.reduce((acc, p) => acc + p.duracion_seg, 0);
let totalDuracionMinutos = Math.floor(totalDuracionProgramaSeg / 60);

let cliente: mqtt.MqttClient;
let topicoTelemetria = '';
let topicoEstado = '';
let topicoComandos = '';
let intervaloTelemetria: NodeJS.Timeout;

console.log(`🤖 SIMULADOR DE PORCELANA IMPERIAL CHINA (Duración: ${totalDuracionMinutos} minutos)`);
console.log('📢 Esperando comando "INICIAR_QUEMA" o "PROGRAMAR_CURVA" desde la App...');

async function iniciarSimuladorDinamico() {
  console.log('⚡ Conectando a la Base de Datos para resolver IDs de inquilinos...');
  let usuarioId = '5a8288b2-132d-45db-9964-b040bf5ffbb7'; // Valor por defecto

  try {
    const consulta = 'SELECT usuario_id FROM dispositivos WHERE id = $1';
    const resultado = await pool.query(consulta, [DISPOSITIVO_ID]);
    if (resultado.rows.length > 0) {
      usuarioId = resultado.rows[0].usuario_id;
      console.log(`🎯 ID de Inquilino resuelto dinámicamente: "${usuarioId}"`);
    } else {
      console.warn(`⚠️ Horno con ID "${DISPOSITIVO_ID}" no encontrado. Usando ID de inquilino por defecto.`);
    }
  } catch (error: any) {
    console.warn(`⚠️ No se pudo conectar a Neon/Postgres (${error.message}). Usando ID de inquilino por defecto.`);
  } finally {
    // Cerrar la conexión de la base de datos para liberar la pila de eventos de red
    try {
      await pool.end();
      console.log('🔌 Conexión a Base de Datos liberada de la pila de eventos.');
    } catch (e) {}
  }

  topicoTelemetria = `usuarios/${usuarioId}/hornos/${DISPOSITIVO_ID}/telemetria`;
  topicoEstado = `usuarios/${usuarioId}/hornos/${DISPOSITIVO_ID}/estado`;
  topicoComandos = `usuarios/+/hornos/${DISPOSITIVO_ID}/comandos`;

  // Configurar cliente MQTT
  cliente = mqtt.connect(BROKER_URL, {
    username: MQTT_USUARIO,
    password: MQTT_CONTRASENA,
    clientId: `esp32_horno_porcelana_${DISPOSITIVO_ID.substring(0, 8)}`,
    clean: true,
    rejectUnauthorized: false,
    protocol: 'wss', // Forzar protocolo WebSockets seguro
    will: {
      topic: topicoEstado,
      payload: Buffer.from('desconectado'),
      qos: 1,
      retain: true,
    }
  });

  // Registrar listeners de forma síncrona en el momento exacto de la creación
  cliente.on('connect', () => {
    console.log('✅ ESP32: Conectado al Broker MQTT exitosamente.');

    // Notificar estado conectado
    cliente.publish(topicoEstado, 'conectado', { qos: 1, retain: true });

    // Suscribirse a comandos
    cliente.subscribe(topicoComandos, (error) => {
      if (!error) {
        console.log(`📥 ESP32: Suscrito a comandos en "${topicoComandos}"`);
      }
    });

    // Iniciar loop periódico
    if (intervaloTelemetria) {
      clearInterval(intervaloTelemetria);
    }
    intervaloTelemetria = setInterval(procesarCicloTelemetria, 3000);
  });

  cliente.on('message', (topico, mensaje) => {
    // Usar validación flex por inclusión para evitar discrepancias de rutas SSL
    if (topico.includes('comandos')) {
      const rawMsg = mensaje.toString();
      console.log(`🚨 ESP32: Comando manual recibido: "${rawMsg}"`);
      
      let accion = "";
      let rampasRecibidas: any[] = [];
      let nombreCurvaRecibida = "";
      let horaInicioRecibida = "";
      
      try {
        const json = JSON.parse(rawMsg);
        if (json.accion) accion = json.accion;
        if (json.rampas) rampasRecibidas = json.rampas;
        if (json.nombre_curva) nombreCurvaRecibida = json.nombre_curva;
        if (json.hora_inicio) horaInicioRecibida = json.hora_inicio;
      } catch(e) {
        accion = rawMsg;
      }

      if (accion.includes('PROGRAMAR_CURVA') && rampasRecibidas.length > 0) {
        console.log(`📝 ESP32: ¡Nueva curva de quema recibida en caliente! "${nombreCurvaRecibida || 'Curva Personalizada'}"`);
        
        programaQuema = rampasRecibidas.map(r => ({
          paso: r.paso,
          tipo: `Paso ${r.paso} (${parseInt(r.estado_horno) === 1 ? '🟢 Quema' : '🛑 Enfriamiento'})`,
          duracion_seg: r.duracion_seg,
          temp_final: parseFloat(r.temp_final),
          estado_horno: r.estado_horno !== undefined ? parseInt(r.estado_horno) : 1,
          limite_ssr: r.limite_ssr !== undefined ? parseInt(r.limite_ssr) : 100
        }));

        console.log("⚙️ ESP32: Pasos cargados en memoria física:");
        programaQuema.forEach(p => {
          console.log(`   [Paso ${p.paso}] Meta: ${p.temp_final}°C | Duración: ${Math.floor(p.duracion_seg/60)} min | Relé: ${p.estado_horno === 1 ? '🟢 ON' : '🛑 OFF'} | Límite SSR: ${p.limite_ssr}%`);
        });
        
        totalPasos = programaQuema.length;
        pasoActualIdx = 0;
        tiempoEnPaso = 0;
        tiempoTotalTranscurrido = 0;
        tempInicialPaso = temperaturaActual;
        quemaFinalizada = false;
        
        totalDuracionProgramaSeg = programaQuema.reduce((acc, p) => acc + p.duracion_seg, 0);
        totalDuracionMinutos = Math.floor(totalDuracionProgramaSeg / 60);
        
        console.log(`⚙️ ESP32: Temporizador del regulador reconfigurado: total ${totalDuracionMinutos} minutos.`);
        
        if (horaInicioRecibida) {
          horaInicioProgramada = new Date(horaInicioRecibida);
          quemaIniciada = false;
          console.log(`⏱️ ESP32: ¡Temporizador Diferido Configurado! La quema iniciará automáticamente a las ${horaInicioProgramada.toLocaleString()}`);
        } else {
          horaInicioProgramada = null;
          quemaIniciada = true;
          console.log('🔥 ESP32: ¡Cronograma cargado e iniciado automáticamente!');
        }
        
      } else if (accion.includes('INICIAR_QUEMA')) {
        if (!quemaIniciada) {
          console.log('🔥 ESP32: Comando "INICIAR_QUEMA" detectado. ¡Encendiendo quemadores e iniciando cronograma rampa!');
          quemaIniciada = true;
          tiempoTotalTranscurrido = 0;
          tiempoEnPaso = 0;
          pasoActualIdx = 0;
          tempInicialPaso = temperaturaActual;
          quemaFinalizada = false;
        }
      } else if (accion.includes('APAGAR_EMERGENCIA')) {
        console.warn('🛑 ESP32: PARADA DE EMERGENCIA ACTIVA. Reseteando resistencias.');
        quemaIniciada = false;
        temperaturaActual = 20.0;
        pasoActualIdx = 0;
        tiempoEnPaso = 0;
        tiempoTotalTranscurrido = 0;
        cliente.publish(topicoEstado, 'desconectado', { qos: 1, retain: true });
      }
    }
  });
}

// Función que ejecuta un paso del bucle de telemetría (Ámbito global)
function procesarCicloTelemetria() {
  if (!quemaIniciada) {
    if (horaInicioProgramada) {
      const ahora = new Date();
      if (ahora >= horaInicioProgramada) {
        console.log(`⏱️ ESP32 [Temporizador]: Hora de inicio alcanzada (${horaInicioProgramada.toLocaleTimeString()}). ¡Iniciando quema programada automáticamente!`);
        quemaIniciada = true;
        horaInicioProgramada = null; 
        tiempoTotalTranscurrido = 0;
        tiempoEnPaso = 0;
        pasoActualIdx = 0;
        tempInicialPaso = temperaturaActual;
        quemaFinalizada = false;
      } else {
        const segRestantes = Math.ceil((horaInicioProgramada.getTime() - ahora.getTime()) / 1000);
        const payloadDiferido = {
          temperatura: parseFloat(temperaturaActual.toFixed(1)),
          temperatura_objetivo: 20.0,
          estado_resistencia: 0.0,
          rssi: -65 - Math.floor(Math.random() * 4),
          mensaje_estado: `Espera diferida: inicia en ${Math.floor(segRestantes / 60)}m ${segRestantes % 60}s`
        };
        cliente.publish(topicoTelemetria, JSON.stringify(payloadDiferido), { qos: 1 });
        console.log(`⏱️ ESP32: Esperando hora programada de inicio (${horaInicioProgramada.toLocaleTimeString()}). Faltan ${Math.floor(segRestantes / 60)}m ${segRestantes % 60}s...`);
        return;
      }
    } else {
      if (temperaturaActual > 25.0) {
        const perdidaCalorEstimada = (temperaturaActual - 25.0) * 0.015; 
        temperaturaActual = Math.max(25.0, temperaturaActual - perdidaCalorEstimada - 0.5);
      }

      const payloadReposo = {
        temperatura: parseFloat(temperaturaActual.toFixed(1)),
        temperatura_objetivo: 20.0,
        estado_resistencia: 0.0,
        rssi: -65 - Math.floor(Math.random() * 4)
      };
      cliente.publish(topicoTelemetria, JSON.stringify(payloadReposo), { qos: 1 });
      return;
    }
  }

  if (pasoActualIdx >= totalPasos) {
    console.log(`\n🎉 ESP32: ¡La curva de quema cargada ha finalizado con éxito!`);
    console.log(`🛑 ESP32: APAGADO AUTOMÁTICO DE SEGURIDAD. Temperatura máxima alcanzada. SSR = 0.0%`);
    quemaFinalizada = true;
    quemaIniciada = false;
    
    const payloadFin = {
      temperatura: parseFloat(temperaturaActual.toFixed(1)),
      temperatura_objetivo: 20.0,
      estado_resistencia: 0.0,
      rssi: -65
    };
    cliente.publish(topicoTelemetria, JSON.stringify(payloadFin), { qos: 1 });
    cliente.publish(topicoEstado, 'desconectado', { qos: 1, retain: true });
    
    pasoActualIdx = 0;
    tiempoEnPaso = 0;
    tiempoTotalTranscurrido = 0;
    return;
  }

  const configPaso = programaQuema[pasoActualIdx];
  const duracionPaso = configPaso.duracion_seg;
  const tempDestino = configPaso.temp_final;

  const progreso = tiempoEnPaso / duracionPaso;
  const setpoint = tempInicialPaso + (progreso * (tempDestino - tempInicialPaso));

  let potenciaSSR = 0;
  
  if (configPaso.estado_horno === 1) {
    const deltaTTarget = setpoint - temperaturaActual;
    const perdidaCalorEstimada = (temperaturaActual - 25.0) * 0.0015; 
    
    let potenciaRequerida = 0;
    if (deltaTTarget > 0) {
      potenciaRequerida = Math.min(100, (perdidaCalorEstimada / 3.5 * 100) + deltaTTarget * 10);
    } else {
      potenciaRequerida = Math.max(0, Math.min(100, (perdidaCalorEstimada / 3.5 * 100) + deltaTTarget * 5));
    }

    const limiteMax = configPaso.limite_ssr !== undefined ? configPaso.limite_ssr : 100;
    potenciaSSR = Math.min(potenciaRequerida, limiteMax);

    const gananciaCalor = (potenciaSSR / 100) * 3.5;
    temperaturaActual = temperaturaActual + gananciaCalor - perdidaCalorEstimada;
  } else {
    potenciaSSR = 0;
    const perdidaCalorEstimada = (temperaturaActual - 25.0) * 0.015; 
    temperaturaActual = Math.max(25.0, temperaturaActual - perdidaCalorEstimada - 0.5);
  }

  const ruido = (Math.random() - 0.5) * 0.4;
  temperaturaActual = Math.max(25.0, temperaturaActual + ruido);

  const rssi = -64 - Math.floor(Math.random() * 6);

  const payload = {
    temperatura: parseFloat(temperaturaActual.toFixed(1)),
    temperatura_objetivo: configPaso.estado_horno === 1 ? parseFloat(setpoint.toFixed(1)) : 20.0,
    estado_resistencia: parseFloat(potenciaSSR.toFixed(1)),
    rssi: rssi
  };

  cliente.publish(topicoTelemetria, JSON.stringify(payload), { qos: 1 });
  
  const minTotales = Math.floor(tiempoTotalTranscurrido / 60);
  const segTotales = tiempoTotalTranscurrido % 60;
  
  console.log(`📈 [Fase ${pasoActualIdx + 1}/${totalPasos} - ${configPaso.tipo}] Tiempo: ${minTotales}m ${segTotales}s | Temp: ${payload.temperatura}°C ──> Setpoint: ${payload.temperatura_objetivo}°C | SSR: ${payload.estado_resistencia}%`);

  tiempoEnPaso += 3;
  tiempoTotalTranscurrido += 3;

  if (tiempoEnPaso > duracionPaso) {
    const diferencia = tempDestino - temperaturaActual;
    if (configPaso.estado_horno === 1 && tempDestino > tempInicialPaso && diferencia > 5.0) {
      console.log(`⏳ ESP32 [Garantía de Temperatura]: Reteniendo paso ${pasoActualIdx + 1}. Esperando meta de ${tempDestino}°C`);
      tiempoEnPaso = duracionPaso; 
    } else {
      pasoActualIdx += 1;
      tiempoEnPaso = 0;
      tempInicialPaso = temperaturaActual;
      console.log(`\n▶️ Avanzando al tramo ${pasoActualIdx + 1} de la gráfica...`);
    }
  }
}

// Inicializar el simulador de forma asíncrona al arrancar
iniciarSimuladorDinamico();
