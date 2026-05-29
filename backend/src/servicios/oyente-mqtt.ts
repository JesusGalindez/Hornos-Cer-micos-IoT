import mqtt from 'mqtt';
import pool from '../config/base_datos';

// Cargar configuraciones del broker desde variables de entorno
const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const USUARIO_SISTEMA = process.env.MQTT_USUARIO_SISTEMA || 'sistema_backend';
const CONTRASENA_SISTEMA = process.env.MQTT_CONTRASENA_SISTEMA || 'token_backend_sistema_9988';

/**
 * Inicializar el Servicio Oyente MQTT
 */
export const iniciarOyenteMQTT = () => {
  console.log(`🔌 Conectando Oyente MQTT al Broker en: ${BROKER_URL}...`);

  const cliente = mqtt.connect(BROKER_URL, {
    username: USUARIO_SISTEMA,
    password: CONTRASENA_SISTEMA,
    clientId: `backend_oyente_service_${Math.random().toString(16).substr(2, 8)}`,
    clean: true,
  });

  // Evento: Conexión Exitosa al Broker
  cliente.on('connect', () => {
    console.log('✅ Oyente MQTT conectado de forma exitosa al broker.');

    // Suscribirse a los tópicos de telemetría y estado de todos los usuarios y hornos cerámicos
    const canales = [
      'usuarios/+/hornos/+/telemetria',
      'usuarios/+/hornos/+/estado'
    ];

    cliente.subscribe(canales, (error) => {
      if (error) {
        console.error('❌ Error al suscribirse a los canales de telemetría:', error);
      } else {
        console.log(`📡 Suscripción exitosa a los canales globales de telemetría y estado.`);
      }
    });
  });

  // Evento: Recepción de Mensajes
  cliente.on('message', async (canal, payload) => {
    const mensajeTexto = payload.toString();
    
    try {
      // Expresión regular para analizar el canal:
      // usuarios/{usuario_id}/hornos/{dispositivo_id}/{sub_topico}
      const patronCanal = /^usuarios\/([a-fA-F0-9-]{36})\/hornos\/([a-fA-F0-9-]{36})\/(telemetria|estado)$/;
      const coincidencia = canal.match(patronCanal);

      if (!coincidencia) {
        return; // Ignorar canales que no cumplan con el patrón SaaS
      }

      const usuarioId = coincidencia[1];
      const dispositivoId = coincidencia[2];
      const subTopico = coincidencia[3];

      // 1. VALIDACIÓN CRUZADA: Verificar en Base de Datos que el dispositivo pertenece al usuario
      const consultaVerificacion = 'SELECT id, usuario_id FROM dispositivos WHERE id = $1';
      const resultadoVerificacion = await pool.query(consultaVerificacion, [dispositivoId]);

      if (resultadoVerificacion.rows.length === 0) {
        console.warn(`🚨 TELEMETRÍA RECHAZADA: El dispositivo ID "${dispositivoId}" no está registrado.`);
        return;
      }

      const dispositivoDB = resultadoVerificacion.rows[0];

      if (dispositivoDB.usuario_id !== usuarioId) {
        console.warn(`🚨 ALERTA DE SEGURIDAD: Intento de telemetría del horno "${dispositivoId}" para el usuario "${usuarioId}", pero pertenece al usuario "${dispositivoDB.usuario_id}".`);
        return;
      }

      // 2. PROCESAMIENTO SEGÚN EL SUBTÓPICO
      if (subTopico === 'telemetria') {
        const datos = JSON.parse(mensajeTexto);
        
        const {
          temperatura,
          temperatura_objetivo,
          estado_resistencia,
          rssi
        } = datos;

        if (temperatura === undefined || temperatura_objetivo === undefined || estado_resistencia === undefined) {
          console.warn(`⚠️ Datos de telemetría corruptos o incompletos desde el horno "${dispositivoId}":`, mensajeTexto);
          return;
        }

        // Determinar el nuevo estado dinámico del horno basado en la telemetría
        // Si la resistencia está activa (> 5%), está calentando. Si la resistencia está apagada, está inactivo.
        let nuevoEstado = 'inactivo';
        if (estado_resistencia > 5.0) {
          nuevoEstado = 'calentando';
        } else if (temperatura > temperatura_objetivo + 2.0) {
          nuevoEstado = 'enfriando';
        }

        // A. Insertar telemetría de serie temporal en TimescaleDB (hipertabla)
        const sqlTelemetria = `
          INSERT INTO telemetria_historica (tiempo, dispositivo_id, temperatura, temperatura_objetivo, estado_resistencia, rssi)
          VALUES (NOW(), $1, $2, $3, $4, $5)
        `;
        await pool.query(sqlTelemetria, [
          dispositivoId,
          temperatura,
          temperatura_objetivo,
          estado_resistencia,
          rssi || null
        ]);

        // B. Actualizar el estado y última actividad del dispositivo relacional de forma asíncrona
        const sqlActualizarDispositivo = `
          UPDATE dispositivos
          SET estado = $1, ultima_actividad = NOW(), actualizado_en = NOW()
          WHERE id = $2
        `;
        await pool.query(sqlActualizarDispositivo, [nuevoEstado, dispositivoId]);

        console.log(`📈 Telemetría registrada - Horno: "${dispositivoId}", Temp: ${temperatura}°C (Objetivo: ${temperatura_objetivo}°C), Resistencia: ${estado_resistencia}%, RSSI: ${rssi || 'N/A'}dBm`);

      } else if (subTopico === 'estado') {
        // Procesar estado de conexión del dispositivo (ej: Last Will and Testament - LWT)
        // Valores válidos: 'conectado' o 'desconectado'
        const estadoConexion = mensajeTexto.trim().toLowerCase();

        if (estadoConexion === 'conectado' || estadoConexion === 'desconectado') {
          const sqlActualizarEstado = `
            UPDATE dispositivos
            SET estado = $1, ultima_actividad = NOW(), actualizado_en = NOW()
            WHERE id = $2
          `;
          await pool.query(sqlActualizarEstado, [estadoConexion, dispositivoId]);
          console.log(`🔌 Conexión actualizada - Horno: "${dispositivoId}" está ahora "${estadoConexion.toUpperCase()}"`);
        }
      }

    } catch (error: any) {
      console.error(`❌ Error al procesar mensaje MQTT en canal "${canal}":`, error.message);
    }
  });

  // Evento: Error de Conexión
  let ultimoErrorReg = 0;
  cliente.on('error', (error: any) => {
    // Evitar spam de logs cada 1 segundo si el broker no está conectado
    const ahora = Date.now();
    if (ahora - ultimoErrorReg > 15000) {
      console.log('⚠️ Servicio MQTT en modo de espera: El Broker no está respondiendo temporalmente.', error.message);
      ultimoErrorReg = ahora;
    }
  });

  // Evento: Reintento de Conexión
  let ultimoReintentReg = 0;
  cliente.on('reconnect', () => {
    const ahora = Date.now();
    if (ahora - ultimoReintentReg > 15000) {
      console.log('🔄 Reintentando conectar silenciosamente al Broker MQTT...');
      ultimoReintentReg = ahora;
    }
  });
};
