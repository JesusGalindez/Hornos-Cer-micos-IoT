import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { iniciarOyenteMQTT } from './servicios/oyente-mqtt';
import mqttAuthRutas from './modules/mqtt-auth/mqtt-auth.rutas';
import { manejadorDeErrores } from './middlewares/error.middleware';

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

// --- INICIALIZACIÓN DE SERVICIOS ---
// Iniciar el suscriptor MQTT en segundo plano para registrar telemetría
// Esperamos un momento para asegurar que la conexión con Postgres se complete
setTimeout(() => {
  try {
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
