import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

// Cargar variables de entorno del archivo .env
dotenv.config();

let configuracionPool: PoolConfig = {};

// 1. Verificar si existe cadena de conexión única (DATABASE_URL)
if (process.env.DATABASE_URL) {
  configuracionPool = {
    connectionString: process.env.DATABASE_URL,
  };

  // Neon.com requiere SSL obligatoriamente para conectarse desde entornos externos.
  // Detectamos si la URL contiene "neon.tech" para configurar SSL de forma transparente.
  if (process.env.DATABASE_URL.includes('neon.tech')) {
    configuracionPool.ssl = {
      rejectUnauthorized: false, // Permite certificados autofirmados/de Neon
    };
    console.log('🔌 Conectando a Neon.com detectado: Configurando SSL automáticamente.');
  }
} else {
  // 2. Conexión clásica por variables individuales
  configuracionPool = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'admin_hornos',
    password: process.env.DB_PASSWORD || 'password_seguro_db',
    database: process.env.DB_NAME || 'hornos_iot',
  };

  if (process.env.DB_SSL === 'true') {
    configuracionPool.ssl = {
      rejectUnauthorized: false,
    };
  }
}

// Inicializar el Pool de Conexiones
const pool = new Pool(configuracionPool);

// Probar conexión de forma inicial y segura
pool.connect((error, cliente, liberar) => {
  if (error) {
    console.error('❌ Error crítico al conectar a la Base de Datos:', error.message);
  } else {
    console.log('✅ Base de Datos PostgreSQL/TimescaleDB conectada de forma exitosa.');
    liberar(); // Devolver el cliente al pool
  }
});

export default pool;
