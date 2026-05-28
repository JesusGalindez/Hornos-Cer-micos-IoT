import pool from './config/base_datos';

async function consultar() {
  console.log('⚡ Conectando a Neon.com...');
  try {
    const res = await pool.query(
      `SELECT tiempo, temperatura, temperatura_objetivo, estado_resistencia, rssi 
       FROM telemetria_historica 
       ORDER BY tiempo DESC 
       LIMIT 10`
    );
    
    console.log('\n📊 TABLA DE TELEMETRÍA EN TIEMPO REAL (NEON.COM):');
    console.log('===================================================================================================');
    console.log('| ' + 'Fecha y Hora (UTC)'.padEnd(24) + ' | ' + 'Temp Actual'.padEnd(13) + ' | ' + 'Temp Objetivo'.padEnd(14) + ' | ' + 'Resistencia (%)'.padEnd(16) + ' | ' + 'RSSI (dBm)'.padEnd(10) + ' |');
    console.log('===================================================================================================');
    
    for (const fila of res.rows) {
      const hora = new Date(fila.tiempo).toISOString().replace('T', ' ').substring(0, 19);
      const temp = `${fila.temperatura}°C`.padEnd(13);
      const obj = `${fila.temperatura_objetivo}°C`.padEnd(14);
      const pw = `${fila.estado_resistencia}%`.padEnd(16);
      const dbm = `${fila.rssi || 'N/A'} dBm`.padEnd(10);
      console.log(`| ${hora.padEnd(24)} | ${temp} | ${obj} | ${pw} | ${dbm} |`);
    }
    console.log('===================================================================================================');
    
    const dis = await pool.query('SELECT nombre, estado, ultima_actividad FROM dispositivos WHERE id = $1', ['b4578e9b-0081-42ab-ba41-d68a994abfe2']);
    console.log('\n🟢 ESTADO ACTUAL DEL HORNO EN LA BASE DE DATOS:');
    console.log(`- Nombre: ${dis.rows[0].nombre}`);
    console.log(`- Estado Relacional: ${dis.rows[0].estado.toUpperCase()}`);
    console.log(`- Última Actividad: ${new Date(dis.rows[0].ultima_actividad).toISOString()}`);

  } catch (error: any) {
    console.error('❌ Error al consultar telemetría:', error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

consultar();
