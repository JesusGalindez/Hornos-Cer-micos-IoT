import pool from './config/base_datos';

async function crearTabla() {
  console.log('⚡ Conectando a Neon.com para crear la tabla quemas_guardadas...');
  
  const queryTabla = `
    CREATE TABLE IF NOT EXISTS quemas_guardadas (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      nombre_curva VARCHAR(100) NOT NULL,
      dispositivo_id UUID NOT NULL REFERENCES dispositivos(id) ON DELETE CASCADE,
      fecha_inicio TIMESTAMPTZ NOT NULL,
      fecha_fin TIMESTAMPTZ NOT NULL,
      temperatura_maxima NUMERIC(5, 2) NOT NULL,
      notas TEXT,
      creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(queryTabla);
    console.log('✅ Tabla "quemas_guardadas" creada con éxito en Neon.com!');
  } catch (error: any) {
    console.error('❌ Error al crear la tabla en Neon.com:', error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

crearTabla();
