import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import mqtt from 'mqtt';
import pool from '../../config/base_datos';

const router = Router();

// Cargar credenciales del sistema para el Backend
const USUARIO_SISTEMA = process.env.MQTT_USUARIO_SISTEMA || 'sistema_backend';
const CONTRASENA_SISTEMA = process.env.MQTT_CONTRASENA_SISTEMA || 'token_backend_sistema_9988';
const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://broker_mqtt:1883';

/**
 * 1. ENDPOINT: Autenticar Conexión MQTT
 * Mosquitto lo llama mediante POST para validar usuario y contraseña.
 */
router.post('/autenticar', async (req: Request, res: Response) => {
  // Mosquitto envía los datos en formato x-www-form-urlencoded o JSON
  const { username, password, clientid } = req.body;

  console.log(`🔑 Intento de conexión MQTT - Usuario: "${username}", ClienteID: "${clientid}"`);

  if (!username || !password) {
    console.warn('⚠️ Credenciales incompletas en la llamada de autenticación');
    return res.status(401).send('Credenciales incompletas');
  }

  try {
    // Caso A: Validar si es el súper-usuario del Backend
    if (username === USUARIO_SISTEMA && password === CONTRASENA_SISTEMA) {
      console.log('👑 Conexión de Súper-Usuario del Backend AUTORIZADA.');
      return res.status(200).send('OK');
    }

    // Caso B: Validar si es un dispositivo ESP32
    // Consultar el dispositivo por su usuario MQTT
    const consulta = 'SELECT id, mqtt_contrasena_hash, usuario_id FROM dispositivos WHERE mqtt_usuario = $1';
    const resultado = await pool.query(consulta, [username]);

    if (resultado.rows.length === 0) {
      console.warn(`❌ Dispositivo no encontrado: "${username}"`);
      return res.status(401).send('Dispositivo no registrado');
    }

    const dispositivo = resultado.rows[0];

    // Verificar el hash bcrypt del token/contraseña
    const contrasenaValida = await bcrypt.compare(password, dispositivo.mqtt_contrasena_hash);

    if (!contrasenaValida) {
      console.warn(`❌ Contraseña incorrecta para el dispositivo: "${username}"`);
      return res.status(401).send('Token inválido');
    }

    console.log(`✅ Dispositivo "${username}" autenticado exitosamente.`);
    return res.status(200).send('OK');

  } catch (error: any) {
    console.error('❌ Error en autenticación MQTT:', error.message);
    return res.status(500).send('Error interno');
  }
});

/**
 * 2. ENDPOINT: Verificar si es Superusuario
 * Mosquitto pregunta si un cliente conectado tiene permisos totales (Superusuario).
 */
router.post('/superusuario', (req: Request, res: Response) => {
  const { username } = req.body;

  if (username && username === USUARIO_SISTEMA) {
    console.log(`👑 Confirmado rol Súper-Usuario para "${username}"`);
    return res.status(200).send('OK');
  }

  // Si no es el súper-usuario, respondemos 401. 
  // Esto obliga a Mosquitto a realizar validaciones ACL normales para este cliente.
  return res.status(401).send('No es superusuario');
});

/**
 * 3. ENDPOINT: Control de Acceso a Tópicos (ACL)
 * Evalúa si un usuario puede Publicar (acc=2) o Suscribirse (acc=1) a un tópico específico.
 */
router.post('/acl', async (req: Request, res: Response) => {
  const { username, clientid, topic, acc } = req.body;
  const modoAcceso = parseInt(acc); // 1 = Suscribir/Leer, 2 = Publicar/Escribir

  // Caso A: Súper-usuario del Backend tiene acceso total ilimitado
  if (username === USUARIO_SISTEMA) {
    return res.status(200).send('OK');
  }

  console.log(`🛡️ Validación ACL - Usuario: "${username}", Tópico: "${topic}", Modo: ${modoAcceso === 1 ? 'Lectura' : 'Escritura'}`);

  if (!username || !topic) {
    return res.status(401).send('Parámetros incompletos');
  }

  try {
    // Expresión regular para validar tópicos en español nativo:
    // usuarios/{usuario_id}/hornos/{dispositivo_id}/{sub_topico}
    // sub_topico: telemetria | comandos | estado
    const patronTopico = /^usuarios\/([a-fA-F0-9-]{36})\/hornos\/([a-fA-F0-9-]{36})\/(telemetria|comandos|estado)$/;
    const coincidencia = topic.match(patronTopico);

    if (!coincidencia) {
      console.warn(`⚠️ Estructura de tópico inválida o denegada: "${topic}"`);
      return res.status(403).send('Tópico no permitido');
    }

    const topicoUsuarioId = coincidencia[1];
    const topicoDispositivoId = coincidencia[2];
    const subTopico = coincidencia[3];

    // Consultar el dispositivo autenticado en la base de datos
    const consulta = 'SELECT id, usuario_id FROM dispositivos WHERE mqtt_usuario = $1';
    const resultado = await pool.query(consulta, [username]);

    if (resultado.rows.length === 0) {
      console.warn(`❌ Dispositivo no encontrado en ACL: "${username}"`);
      return res.status(401).send('No autorizado');
    }

    const dispositivoActual = resultado.rows[0];

    // --- REGLAS DE SEGURIDAD STRICT-ZERO-TRUST ---
    
    // 1. El dispositivo_id del tópico debe coincidir exactamente con el ID del dispositivo conectado
    if (dispositivoActual.id !== topicoDispositivoId) {
      console.warn(`🚨 INTENTO DE SUPLANTACIÓN: El dispositivo "${username}" (ID: ${dispositivoActual.id}) intentó acceder a datos del horno "${topicoDispositivoId}"`);
      return res.status(403).send('No autorizado a otros dispositivos');
    }

    // 2. El usuario_id del tópico debe coincidir con el dueño del dispositivo
    if (dispositivoActual.usuario_id !== topicoUsuarioId) {
      console.warn(`🚨 AISLAMIENTO MULTI-TENANT VIOLADO: El dispositivo de "${username}" no pertenece al usuario "${topicoUsuarioId}"`);
      return res.status(403).send('Aislamiento de inquilino violado');
    }

    // 3. Reglas de Dirección de Datos (Lectura / Escritura)
    if (modoAcceso === 2) {
      // Un ESP32 SOLO puede PUBLICAR su propia telemetría o su estado de conexión
      if (subTopico !== 'telemetria' && subTopico !== 'estado') {
        console.warn(`🚨 ACCESO DENEGADO: El dispositivo intentó publicar en un canal no permitido: "${subTopico}"`);
        return res.status(403).send('Escritura prohibida en este canal');
      }
    } else if (modoAcceso === 1) {
      // Un ESP32 SOLO puede SUSCRIBIRSE a comandos del backend
      if (subTopico !== 'comandos') {
        console.warn(`🚨 ACCESO DENEGADO: El dispositivo intentó suscribirse a un canal no permitido: "${subTopico}"`);
        return res.status(403).send('Lectura prohibida en este canal');
      }
    }

    console.log(`✅ ACL APROBADA para dispositivo "${username}" sobre el tópico "${topic}"`);
    return res.status(200).send('OK');

  } catch (error: any) {
    console.error('❌ Error crítico en validación ACL:', error.message);
    return res.status(500).send('Error interno');
  }
});

/**
 * 4. ENDPOINT: Guardar y Programar Curva de Quema (MQTT)
 * Recibe la curva configurada interactivamente desde la web, la guarda en Neon.com y la envía al ESP32.
 */
router.post('/programar', async (req: Request, res: Response) => {
  const { usuario_id, dispositivo_id, nombre_curva, rampas } = req.body;

  if (!usuario_id || !dispositivo_id || !rampas || !Array.isArray(rampas)) {
    return res.status(400).json({ exito: false, mensaje: 'Parámetros obligatorios incompletos' });
  }

  let rampa_config_id = null;
  let dbExito = false;

  try {
    // A. Limpiar telemetría histórica previa para este dispositivo antes de iniciar la nueva quema (opcional en modo offline)
    const consultaLimpiar = 'DELETE FROM telemetria_historica WHERE dispositivo_id = $1';
    await pool.query(consultaLimpiar, [dispositivo_id]);

    // B. Guardar configuración relacional en Neon.com (opcional en modo offline)
    const consultaGuardar = `
      INSERT INTO rampas_config (nombre, descripcion, usuario_id, segmentos)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `;
    const resultadoGuardar = await pool.query(consultaGuardar, [
      nombre_curva || 'Curva Manual',
      'Configurada interactivamente desde el panel web de control',
      usuario_id,
      JSON.stringify(rampas)
    ]);
    rampa_config_id = resultadoGuardar.rows[0].id;
    dbExito = true;
  } catch (dbError: any) {
    console.warn(`⚠️ Advertencia de base de datos (Modo offline activo): ${dbError.message}`);
  }

    // C. Publicar en Mosquitto MQTT en el tópico de comandos
    const opcionesConexion: mqtt.IClientOptions = {
      username: USUARIO_SISTEMA,
      password: CONTRASENA_SISTEMA,
      clientId: `backend_publicador_${Math.random().toString(16).substr(2, 8)}`,
    };

    // Configurar TLS para HiveMQ Cloud
    if (BROKER_URL.startsWith('mqtts://')) {
      opcionesConexion.rejectUnauthorized = false;
    }

    const clienteMqtt = mqtt.connect(BROKER_URL, opcionesConexion);

    clienteMqtt.on('connect', () => {
      const topicoComandos = `usuarios/${usuario_id}/hornos/${dispositivo_id}/comandos`;
      const payload = {
        accion: 'PROGRAMAR_CURVA',
        nombre_curva,
        rampas,
        hora_inicio: req.body.hora_inicio || null
      };

      clienteMqtt.publish(topicoComandos, JSON.stringify(payload), { qos: 1 }, () => {
        console.log(`📤 Backend: Nueva curva "${nombre_curva}" (Inicio: ${req.body.hora_inicio || 'Inmediato'}) enviada por MQTT al horno "${dispositivo_id}".`);
        clienteMqtt.end();
      });
    });

    clienteMqtt.on('error', (err) => {
      console.error('❌ Error de conexión en el publicador MQTT:', err.message);
    });

    const mensajeRespuesta = dbExito
      ? 'Curva guardada en Neon.com y enviada al horno por MQTT exitosamente'
      : 'Curva enviada al horno por MQTT exitosamente (Modo offline resiliente - BD no disponible)';

    return res.status(200).json({
      exito: true,
      mensaje: mensajeRespuesta,
      rampa_config_id: rampa_config_id
    });

  } catch (error: any) {
    console.error('❌ Error al programar la curva en MQTT:', error.message);
    return res.status(500).json({ exito: false, mensaje: 'Error interno al enviar comando por MQTT' });
  }
});

/**
 * 4.5 ENDPOINT: Enviar Comando Manual (MQTT)
 * Permite enviar acciones como INICIAR_QUEMA o APAGAR_EMERGENCIA al horno.
 */
router.post('/comando', async (req: Request, res: Response) => {
  const { usuario_id, dispositivo_id, accion } = req.body;

  if (!usuario_id || !dispositivo_id || !accion) {
    return res.status(400).json({ exito: false, mensaje: 'Parámetros obligatorios incompletos' });
  }

  try {
    const opcionesConexion: mqtt.IClientOptions = {
      username: USUARIO_SISTEMA,
      password: CONTRASENA_SISTEMA,
      clientId: `backend_comandante_${Math.random().toString(16).substr(2, 8)}`,
    };

    // Configurar TLS para HiveMQ Cloud
    if (BROKER_URL.startsWith('mqtts://')) {
      opcionesConexion.rejectUnauthorized = false;
    }

    const clienteMqtt = mqtt.connect(BROKER_URL, opcionesConexion);

    clienteMqtt.on('connect', () => {
      const topicoComandos = `usuarios/${usuario_id}/hornos/${dispositivo_id}/comandos`;
      const payload = { accion };

      clienteMqtt.publish(topicoComandos, JSON.stringify(payload), { qos: 1 }, () => {
        console.log(`📤 Backend: Comando manual "${accion}" enviado por MQTT al horno "${dispositivo_id}".`);
        clienteMqtt.end();
      });
    });

    clienteMqtt.on('error', (err) => {
      console.error('❌ Error de conexión en el comandante MQTT:', err.message);
    });

    return res.status(200).json({
      exito: true,
      mensaje: `Comando manual "${accion}" enviado al horno exitosamente`
    });

  } catch (error: any) {
    console.error('❌ Error al enviar comando MQTT:', error.message);
    return res.status(500).json({ exito: false, mensaje: 'Error interno al enviar comando' });
  }
});

/**
 * 5. ENDPOINT: Obtener Telemetría Histórica Completa (Desde Minuto Cero)
 * Devuelve hasta 1500 registros de temperatura para trazar la curva entera del ciclo.
 */
router.get('/telemetria/:dispositivo_id', async (req: Request, res: Response) => {
  const { dispositivo_id } = req.params;

  try {
    const consulta = `
      SELECT tiempo, temperatura, temperatura_objetivo, estado_resistencia 
      FROM telemetria_historica 
      WHERE dispositivo_id = $1 
      ORDER BY tiempo DESC 
      LIMIT 1500
    `;
    const resultado = await pool.query(consulta, [dispositivo_id]);

    // Retornamos invertido para tener orden temporal ascendente (pasado -> presente)
    return res.status(200).json({
      exito: true,
      datos: resultado.rows.reverse()
    });

  } catch (error: any) {
    console.error('❌ Error al obtener telemetría histórica:', error.message);
    return res.status(500).json({ exito: false, mensaje: 'Error interno de base de datos' });
  }
});

/**
 * 6. ENDPOINT: Guardar Historial de Quema
 * Guarda los detalles de una quema completada o detenida en la tabla quemas_guardadas.
 */
router.post('/guardar-historial', async (req: Request, res: Response) => {
  const { nombre_curva, dispositivo_id, fecha_inicio, fecha_fin, temperatura_maxima, notas } = req.body;

  if (!nombre_curva || !dispositivo_id || !fecha_inicio || !fecha_fin || temperatura_maxima === undefined) {
    return res.status(400).json({ exito: false, mensaje: 'Parámetros obligatorios incompletos' });
  }

  try {
    const consulta = `
      INSERT INTO quemas_guardadas (nombre_curva, dispositivo_id, fecha_inicio, fecha_fin, temperatura_maxima, notas)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, creado_en
    `;
    const resultado = await pool.query(consulta, [
      nombre_curva,
      dispositivo_id,
      fecha_inicio,
      fecha_fin,
      temperatura_maxima,
      notas || ''
    ]);

    return res.status(200).json({
      exito: true,
      mensaje: 'Historial de quema guardado exitosamente en Neon.com',
      registro_id: resultado.rows[0].id
    });
  } catch (error: any) {
    console.error('❌ Error al guardar historial de quema:', error.message);
    return res.status(500).json({ exito: false, mensaje: 'Error interno de servidor' });
  }
});

/**
 * 7. ENDPOINT: Listar Quemas Guardadas
 * Retorna todos los registros de quemas guardados históricamente.
 */
router.get('/quemas-guardadas', async (req: Request, res: Response) => {
  try {
    const consulta = `
      SELECT id, nombre_curva, dispositivo_id, fecha_inicio, fecha_fin, temperatura_maxima, notas, creado_en
      FROM quemas_guardadas
      ORDER BY creado_en DESC
    `;
    const resultado = await pool.query(consulta);
    return res.status(200).json({ exito: true, datos: resultado.rows });
  } catch (error: any) {
    console.error('❌ Error al listar quemas guardadas:', error.message);
    return res.status(500).json({ exito: false, mensaje: 'Error interno de base de datos' });
  }
});

export default router;
