import pool from './config/base_datos';

async function corregirColumnas() {
  console.log('⚡ Conectando a Neon.com para corregir los tipos de columnas a NUMERIC(6, 2)...');
  
  const queryAlterTelemetria = `
    ALTER TABLE telemetria_historica 
      ALTER COLUMN temperatura TYPE NUMERIC(6, 2),
      ALTER COLUMN temperatura_objetivo TYPE NUMERIC(6, 2);
  `;

  const queryAlterQuemas = `
    ALTER TABLE quemas_guardadas 
      ALTER COLUMN temperatura_maxima TYPE NUMERIC(6, 2);
  `;

  try {
    await pool.query(queryAlterTelemetria);
    console.log('✅ Columnas de telemetria_historica corregidas con éxito en Neon.com!');
    
    try {
      await pool.query(queryAlterQuemas);
      console.log('✅ Columna de quemas_guardadas corregida con éxito en Neon.com!');
    } catch (e: any) {
      console.warn('⚠️ Nota sobre quemas_guardadas:', e.message);
    }
  } catch (error: any) {
    console.error('❌ Error al corregir las columnas en Neon.com:', error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

corregirColumnas();
