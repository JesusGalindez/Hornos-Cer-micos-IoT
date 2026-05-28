import mqtt from 'mqtt';

const BROKER_URL = 'mqtt://localhost:1883';

console.log('🕵️‍♂️ INICIANDO SIMULADOR DE INFILTRACIÓN / ATAQUE DE SEGURIDAD');
console.log('===========================================================');

/**
 * PRUEBA 1: Intentar conectarse con un token de acceso inválido
 */
const probarConexionFallida = () => {
  console.log('\n❌ [PRUEBA 1] Intentando conectar con credenciales falsas...');
  
  const clienteMalicioso = mqtt.connect(BROKER_URL, {
    username: 'horno_esp32_1',
    password: 'token_falso_malicioso_999', // Token incorrecto
    clientId: 'esp32_hacker_1',
    clean: true,
    connectTimeout: 2000,
  });

  clienteMalicioso.on('connect', () => {
    console.error('🚨 SEGURIDAD COMPROMETIDA: El broker permitió la conexión con credenciales falsas.');
    clienteMalicioso.end();
  });

  clienteMalicioso.on('error', (error: any) => {
    // Si la conexión es rechazada por falta de autorización, ocurrirá este evento
    console.log(`🛡️ EXCELENTE: Conexión rechazada de forma segura por el Broker (Error: ${error.message})`);
  });

  clienteMalicioso.on('close', () => {
    console.log('🔒 PRUEBA 1 COMPLETADA: Conexión cerrada de forma segura.');
    // Iniciar Prueba 2
    probarAtaqueACL();
  });
};

/**
 * PRUEBA 2: Conectarse de forma válida, pero intentar suplantar/leer tópicos de otro usuario
 */
const probarAtaqueACL = () => {
  console.log('\n🔒 [PRUEBA 2] Conectando con credenciales VÁLIDAS de "horno_esp32_1", pero intentando violar aislamiento multitenant...');

  const clienteEspia = mqtt.connect(BROKER_URL, {
    username: 'horno_esp32_1',
    password: 'token_esp32_secreto_123', // Credencial real del horno 1
    clientId: 'esp32_horno_1_espia',
    clean: true,
  });

  clienteEspia.on('connect', () => {
    console.log('✅ Conexión establecida (Credenciales reales).');

    // Tópico ajeno ficticio
    const topicoAjeno = 'usuarios/d1f87e91-e402-4fdb-9ef1-4b1365ad4de0/hornos/99999999-0000-0000-0000-999999999999/telemetria';

    console.log(`🚨 Intentando PUBLICAR datos en el canal de otro usuario: "${topicoAjeno}"`);
    
    // Intentar publicar telemetría falsa en la cuenta de otro usuario
    clienteEspia.publish(topicoAjeno, JSON.stringify({ temperatura: 999.0 }), { qos: 1 }, (err) => {
      if (err) {
        console.log('🛡️ EXCELENTE: El Broker denegó la publicación por violación de ACL.');
      } else {
        // En algunos casos, Mosquitto descarta silenciosamente los paquetes que violan ACL sin retornar error
        // pero valida que no lleguen a su destino.
        console.log('📬 Envío solicitado (Sujeto a descarte inmediato del Broker si falla ACL).');
      }
    });

    // Intentar SUSCRIBIRSE a comandos del horno de otro usuario para robar información
    const topicoComandosAjeno = 'usuarios/d1f87e91-e402-4fdb-9ef1-4b1365ad4de0/hornos/99999999-0000-0000-0000-999999999999/comandos';
    console.log(`🚨 Intentando SUSCRIBIRSE al canal de comandos de otro usuario: "${topicoComandosAjeno}"`);

    clienteEspia.subscribe(topicoComandosAjeno, (err, otorgado) => {
      if (err) {
        console.log('🛡️ EXCELENTE: El Broker denegó la suscripción.');
      } else if (otorgado && otorgado[0] && otorgado[0].qos === 128) {
        // En MQTT 3.1.1/5, el broker otorga QoS 128 (0x80) para indicar que la suscripción fue rechazada/no autorizada
        console.log('🛡️ EXCELENTE: El Broker retornó QoS 128 (Suscripción Rechazada por ACL). El ataque ha sido neutralizado.');
      } else {
        console.error('🚨 ALERTA: ¡Suscripción permitida! Falla en reglas ACL del broker.');
      }

      // Cerrar conexión tras prueba
      setTimeout(() => {
        console.log('\n===========================================================');
        console.log('🏁 FINALIZACIÓN DE PRUEBAS DE SEGURIDAD.');
        clienteEspia.end();
      }, 2000);
    });
  });
};

// Iniciar suite de pruebas
probarConexionFallida();
