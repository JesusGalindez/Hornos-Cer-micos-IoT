package com.ceramikcloud.iot.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ceramikcloud.iot.data.PasoRampa

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(viewModel: DashboardViewModel) {
    val tempActual by viewModel.temperaturaActual.collectAsState()
    val tempObjetivo by viewModel.temperaturaObjetivo.collectAsState()
    val estadoResistencia by viewModel.estadoResistencia.collectAsState()
    val estadoHorno by viewModel.estadoHorno.collectAsState()
    val notifThrottling by viewModel.notificacionThrottling.collectAsState()

    // Configuración estética de colores (Premium Dark-Mode Glassmorphism)
    val colorPrincipalFondo = Color(0xFF0B0C16)
    val colorTarjetaFondo = Color(0x9916182F)
    val colorBordeTarjeta = Color(0x1AFFFFFF)
    
    val primarioBrillo = Color(0xFFFF7B00)
    val secundarioBrillo = Color(0xFF00F3FF)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colorPrincipalFondo)
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // HEADER DE APP MÓVIL
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "CeramikCloud IoT",
                    color = Color.White,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.ExtraBold
                )
                Text(
                    text = "Monitoreo Móvil en Vivo (Neon)",
                    color = Color.Gray,
                    fontSize = 12.sp
                )
            }
            Text(
                text = "Alberto G.",
                color = secundarioBrillo,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp
            )
        }

        // TARJETA 1: WIDGET DE TELEMETRÍA Y TERMÓMETRO EN VIVO
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp)
                .border(1.dp, colorBordeTarjeta, RoundedCornerShape(20.dp)),
            colors = CardDefaults.cardColors(containerColor = colorTarjetaFondo),
            shape = RoundedCornerShape(20.dp)
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text(
                    text = "🌡️ Termómetro y Estado de Cabina",
                    color = Color.White,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )

                Spacer(modifier = Modifier.height(16.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Termómetro Vertical Estilizado en Compose
                    Box(
                        modifier = Modifier
                            .width(16.dp)
                            .height(110.dp)
                            .background(Color(0x33FFFFFF), RoundedCornerShape(10.dp))
                            .border(1.dp, Color(0x33FFFFFF), RoundedCornerShape(10.dp)),
                        contentAlignment = Alignment.BottomCenter
                    ) {
                        // Altura del mercurio en porcentaje
                        val heightPercentage = (tempActual / 1300.0).coerceIn(0.0, 1.0)
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .fillMaxHeight(heightPercentage.toFloat())
                                .background(
                                    Brush.verticalGradient(
                                        colors = listOf(primarioBrillo, secundarioBrillo)
                                    ),
                                    RoundedCornerShape(10.dp)
                                )
                        )
                    }

                    // Lectura Numérica de Temperatura a lo Grande
                    Column(
                        horizontalAlignment = Alignment.End
                    ) {
                        Text(
                            text = "${tempActual.toInt()}°C",
                            color = Color.White,
                            fontSize = 48.sp,
                            fontWeight = FontWeight.Black
                        )
                        Text(
                            text = "Objetivo: ${tempObjetivo.toInt()}°C",
                            color = Color.Gray,
                            fontSize = 14.sp
                        )
                        Text(
                            text = "Resistencia: ${estadoResistencia.toInt()}%",
                            color = primarioBrillo,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Estado de Alerta de Seguridad
                val (alertaTexto, alertaColor) = when {
                    tempActual < 100.0 -> "🌡️ Temperatura Ambiente Segura" to Color(0xFF10B981)
                    tempActual < 500.0 -> "⚠️ Horno Caliente - ¡Evitar contacto!" to Color(0xFFFBBF24)
                    tempActual < 1000.0 -> "🔥 Alta Temperatura - Firing Activo" to Color(0xFFFF7B00)
                    else -> "🚨 Calor Extremo - Mantener Distancia" to Color(0xFFEF4444)
                }

                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = alertaColor.copy(alpha = 0.15f),
                    shape = RoundedCornerShape(10.dp),
                    border = BorderStroke(1.dp, alertaColor.copy(alpha = 0.3f))
                ) {
                    Text(
                        text = alertaTexto,
                        color = alertaColor,
                        modifier = Modifier.padding(10.dp),
                        textAlign = TextAlign.Center,
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp
                    )
                }
            }
        }

        // TARJETA 2: PROGRESO DE LA ETAPA / RAMPA
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp)
                .border(1.dp, colorBordeTarjeta, RoundedCornerShape(20.dp)),
            colors = CardDefaults.cardColors(containerColor = colorTarjetaFondo),
            shape = RoundedCornerShape(20.dp)
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "📊 Progreso de Quema",
                        color = Color.White,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = estadoHorno,
                        color = when {
                            estadoHorno.contains("CALENTANDO") -> primarioBrillo
                            estadoHorno.contains("ESPERA") -> Color(0xFFFBBF24)
                            else -> secundarioBrillo
                        },
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                val isDiferido = estadoHorno.contains("ESPERA")
                LinearProgressIndicator(
                    progress = if (isDiferido) 0f else 0.65f,
                    modifier = Modifier.fillMaxWidth().height(8.dp),
                    color = if (isDiferido) Color(0xFFFBBF24) else primarioBrillo,
                    trackColor = Color(0x33FFFFFF)
                )

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = notifThrottling,
                    color = if (isDiferido) Color(0xFFFBBF24) else secundarioBrillo,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center
                )
            }
        }

        // TARJETA 3: OPERACIONES Y CONTROL EN VIVO
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp)
                .border(1.dp, colorBordeTarjeta, RoundedCornerShape(20.dp)),
            colors = CardDefaults.cardColors(containerColor = colorTarjetaFondo),
            shape = RoundedCornerShape(20.dp)
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text(
                    text = "🕹️ Control de Operaciones",
                    color = Color.White,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )

                Spacer(modifier = Modifier.height(16.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Button(
                        onClick = { viewModel.enviarComando("INICIAR_QUEMA") },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text("🟢 Iniciar", color = Color.White, fontWeight = FontWeight.Bold)
                    }

                    Button(
                        onClick = { viewModel.enviarComando("APAGAR_EMERGENCIA") },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444)),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text("🛑 Apagar", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                Button(
                    onClick = { viewModel.cargarHistorialMinutoCero() },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0x1AFFFFFF)),
                    shape = RoundedCornerShape(10.dp),
                    border = BorderStroke(1.dp, colorBordeTarjeta)
                ) {
                    Text("🔄 Forzar Recarga (Neon Cloud)", color = Color.White)
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // TARJETA 4: PROGRAMAR QUEMA Y TEMPORIZADOR DIFERIDO
        var nombreCurvaInput by remember { mutableStateOf("Bizcocho Imperial") }
        var delayMinutos by remember { mutableStateOf(0f) } // Slider de 0 a 120 minutos (0 = Inmediato)
        
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp)
                .border(1.dp, colorBordeTarjeta, RoundedCornerShape(20.dp)),
            colors = CardDefaults.cardColors(containerColor = colorTarjetaFondo),
            shape = RoundedCornerShape(20.dp)
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text(
                    text = "📅 Programación de Rampa & Timer",
                    color = Color.White,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = nombreCurvaInput,
                    onValueChange = { nombreCurvaInput = it },
                    label = { Text("Nombre de la Curva", color = Color.Gray) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = primarioBrillo,
                        unfocusedBorderColor = colorBordeTarjeta
                    )
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Temporizador slider
                Text(
                    text = if (delayMinutos.toInt() == 0) "⏱️ Inicio: Inmediato" else "⏱️ Inicio Diferido: En ${delayMinutos.toInt()} minutos",
                    color = if (delayMinutos.toInt() == 0) Color.White else Color(0xFFFBBF24),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold
                )

                Slider(
                    value = delayMinutos,
                    onValueChange = { delayMinutos = it },
                    valueRange = 0f..120f,
                    steps = 24, // Ticks cada 5 minutos
                    colors = SliderDefaults.colors(
                        thumbColor = if (delayMinutos.toInt() == 0) primarioBrillo else Color(0xFFFBBF24),
                        activeTrackColor = if (delayMinutos.toInt() == 0) primarioBrillo else Color(0xFFFBBF24)
                    )
                )

                Spacer(modifier = Modifier.height(12.dp))

                Button(
                    onClick = {
                        val instantString = if (delayMinutos.toInt() == 0) {
                            null
                        } else {
                            val timeMs = System.currentTimeMillis() + (delayMinutos.toLong() * 60 * 1000)
                            // Generar formato ISO 8601 compatible con backend
                            java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
                                timeZone = java.util.TimeZone.getTimeZone("UTC")
                            }.format(java.util.Date(timeMs))
                        }

                        // Curva de prueba con el nuevo estado_horno y limite_ssr variable
                        val rampasPrueba = listOf(
                            PasoRampa(paso = 1, duracion_seg = 180, temp_final = 200, estado_horno = 1, limite_ssr = 80),
                            PasoRampa(paso = 2, duracion_seg = 300, temp_final = 200, estado_horno = 1, limite_ssr = 80),
                            PasoRampa(paso = 3, duracion_seg = 240, temp_final = 500, estado_horno = 1, limite_ssr = 100),
                            PasoRampa(paso = 4, duracion_seg = 300, temp_final = 500, estado_horno = 1, limite_ssr = 100)
                        )

                        viewModel.programarCurvaDiferida(
                            nombreCurva = nombreCurvaInput,
                            rampas = rampasPrueba,
                            horaInicio = instantString
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = primarioBrillo),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text("📤 Cargar Curva con Timer (Neon + MQTT)", color = Color.White, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
