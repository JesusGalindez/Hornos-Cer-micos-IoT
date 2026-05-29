// ============================================================================
// Release v2.0.2 - Sincronizacion de Grafica y Limpieza de UI
// ============================================================================
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { iniciarOyenteMQTT } from './servicios/oyente-mqtt';
import mqttAuthRutas from './modules/mqtt-auth/mqtt-auth.rutas';
import { manejadorDeErrores } from './middlewares/error.middleware';
import bcrypt from 'bcrypt';
import pool from './config/base_datos';

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar CORS
app.use(cors());

// Servir archivos estáticos del panel frontal
// Esta resolución dinámica funciona perfectamente tanto en desarrollo (src/) como en producción (dist/)
const rutaPublica = __dirname.includes('dist') 
  ? path.join(__dirname, '../public') 
  : path.join(__dirname, '../public');

// Si por alguna razón el build no tiene la estructura, se busca un nivel arriba de forma segura
app.use(express.static(rutaPublica));
app.use(express.static(path.join(process.cwd(), 'public')));

// --- PARSERS DE CUERPO (BODY PARSERS) ---
// JSON Parser para API estándar
app.use(express.json());

// urlencoded Parser: VITAL para Mosquitto `go-auth` que envía parámetros vía POST form-urlencoded
app.use(express.urlencoded({ extended: true }));

// --- RUTAS DE LA APLICACIÓN ---
// Rutas de autenticación dinámica y ACLs para el Broker Mosquitto
app.use('/api/v1/mqtt', mqttAuthRutas);

// Ruta de estado de salud (Health Check)
app.get('/api/salud', (req, res) => {
  res.status(200).json({
    exito: true,
    mensaje: 'Servidor de Hornos Cerámicos IoT activo y saludable',
    fecha: new Date()
  });
});

/**
 * SEEDER AUTOMÁTICO MULTI-TENANT DE SEGURIDAD
 * Auto-siembra a los tres usuarios de pruebas y sus hornos si no existen en la BD.
 */
async function sembrarDatosPrueba() {
  console.log('🌱 Iniciando verificación y auto-siembra de cuentas de prueba...');
  try {
    const contrasenaComunHash = await bcrypt.hash('password123', 10);
    const tokenSebastianHash = await bcrypt.hash('token_sebastian_123', 10);
    const tokenAbelHash = await bcrypt.hash('token_abel_123', 10);

    // 1. Sembrar Alberto
    const sqlUser1 = `
      INSERT INTO usuarios (id, correo, contrasena_hash, nombre)
      VALUES ('5a8288b2-132d-45db-9964-b040bf5ffbb7', 'alberto@ejemplo.com', $1, 'Alberto Galíndez')
      ON CONFLICT (correo) DO NOTHING
    `;
    await pool.query(sqlUser1, [contrasenaComunHash]);

    const sqlDevice1 = `
      INSERT INTO dispositivos (id, nombre, usuario_id, mqtt_usuario, mqtt_contrasena_hash, estado)
      VALUES ('b4578e9b-0081-42ab-ba41-d68a994abfe2', 'Horno Principal de Alberto', '5a8288b2-132d-45db-9964-b040bf5ffbb7', 'horno_esp32_1', $1, 'desconectado')
      ON CONFLICT (mqtt_usuario) DO NOTHING
    `;
    await pool.query(sqlDevice1, [contrasenaComunHash]);

    // 2. Sembrar Sebastian Ettese
    const sqlUser2 = `
      INSERT INTO usuarios (id, correo, contrasena_hash, nombre)
      VALUES ('f398c933-dc7c-4f5d-826d-a5a417438bfb', 'sebastian@ejemplo.com', $1, 'Sebastian Ettese')
      ON CONFLICT (correo) DO NOTHING
    `;
    await pool.query(sqlUser2, [contrasenaComunHash]);

    const sqlDevice2 = `
      INSERT INTO dispositivos (id, nombre, usuario_id, mqtt_usuario, mqtt_contrasena_hash, estado)
      VALUES ('25b04ad2-69a9-49a0-b2ea-72c867658cb1', 'Horno de Sebastian', 'f398c933-dc7c-4f5d-826d-a5a417438bfb', 'horno_sebastian', $1, 'desconectado')
      ON CONFLICT (mqtt_usuario) DO NOTHING
    `;
    await pool.query(sqlDevice2, [tokenSebastianHash]);

    // 3. Sembrar Abel Inocente
    const sqlUser3 = `
      INSERT INTO usuarios (id, correo, contrasena_hash, nombre)
      VALUES ('24527d36-fafa-4366-80ea-3e3a90a454b2', 'abel@ejemplo.com', $1, 'Abel Inocente')
      ON CONFLICT (correo) DO NOTHING
    `;
    await pool.query(sqlUser3, [contrasenaComunHash]);

    const sqlDevice3 = `
      INSERT INTO dispositivos (id, nombre, usuario_id, mqtt_usuario, mqtt_contrasena_hash, estado)
      VALUES ('68ab4b18-ad02-4771-969b-080d3d853180', 'Horno de Abel', '24527d36-fafa-4366-80ea-3e3a90a454b2', 'horno_abel', $1, 'desconectado')
      ON CONFLICT (mqtt_usuario) DO NOTHING
    `;
    await pool.query(sqlDevice3, [tokenAbelHash]);

    console.log('✅ Verificación y auto-siembra de cuentas completada con éxito.');
  } catch (err: any) {
    console.error('⚠️ Error al auto-sembrar cuentas de prueba:', err.message);
  }
}

// --- INICIALIZACIÓN DE SERVICIOS ---
// Iniciar el suscriptor MQTT en segundo plano para registrar telemetría
// Esperamos un momento para asegurar que la conexión con Postgres se complete
setTimeout(async () => {
  try {
    await sembrarDatosPrueba();
    iniciarOyenteMQTT();
  } catch (error) {
    console.error('❌ Error fatal al inicializar el Oyente MQTT:', error);
  }
}, 2000);

// Middleware global de errores (Debe ser el último en registrarse)
app.use(manejadorDeErrores);

// Iniciar Servidor HTTP Express
app.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`🚀 SERVIDOR SAAS DE HORNOS CERÁMICOS INICIADO DE FORMA EXITOSA`);
  console.log(`📡 Puerto de Escucha API: http://localhost:${PORT}`);
  console.log(`🌐 Entorno: ${process.env.NODE_ENV}`);
  console.log(`================================================================`);
});

export default app;
