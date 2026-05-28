import bcrypt from 'bcrypt';
import pool from './config/base_datos';

async function ejecutar() {
  const token = 'token_esp32_secreto_123';
  
  console.log('⏳ Generando hash bcrypt real para:', token);
  const nuevoHash = await bcrypt.hash(token, 10);
  console.log('🔑 Hash generado:', nuevoHash);

  try {
    const consulta = `
      UPDATE dispositivos 
      SET mqtt_contrasena_hash = $1 
      WHERE mqtt_usuario = $2 
      RETURNING id, nombre
    `;
    const resultado = await pool.query(consulta, [nuevoHash, 'horno_esp32_1']);

    if (resultado.rowCount === 0) {
      console.error('❌ No se encontró ningún dispositivo con el usuario "horno_esp32_1" en tu base de datos de Neon.com.');
    } else {
      console.log(`✅ Hash actualizado con éxito para el horno: "${resultado.rows[0].nombre}" (ID: ${resultado.rows[0].id})`);
    }
  } catch (error: any) {
    console.error('❌ Error al actualizar la base de datos:', error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

ejecutar();
