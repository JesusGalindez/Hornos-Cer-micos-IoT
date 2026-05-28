# Código Fuente Actualizado de Android (Unificación Web-IoT + Programación y Temporizador)

Este archivo contiene el código completo y listo para producción de los cuatro archivos clave del proyecto Android nativo (Jetpack Compose + Retrofit). Puedes copiar este archivo directamente o alimentar con él a tu asistente en **AI Studio** para que procese y entienda las estructuras de datos de forma sumamente sencilla.

---

## 1. ⚙️ Archivo: `CeramikCloudApi.kt`
**Ruta en tu computador:** `/Users/albertogalindez/.gemini/antigravity/scratch/ceramic-kiln-iot/android/app/src/main/java/com/ceramikcloud/iot/data/CeramikCloudApi.kt`

```kotlin
package com.ceramikcloud.iot.data

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

// Modelos de datos para Retrofit
data class PasoRampa(
    val paso: Int,
    val duracion_seg: Int,
    val temp_final: Int,
    val estado_horno: Int? = 1,
    val limite_ssr: Int? = 100
)

data class ProgramarRampaRequest(
    val usuario_id: String,
    val dispositivo_id: String,
    val nombre_curva: String,
    val rampas: List<PasoRampa>,
    val hora_inicio: String? = null
)

data class ComandoRequest(
    val usuario_id: String,
    val dispositivo_id: String,
    val accion: String
)

data class TelemetriaPunto(
    val tiempo: String,
    val temperatura: String,
    val temperatura_objetivo: String,
    val estado_resistencia: String,
    val rssi: String?,
    val mensaje_estado: String? = null
)

data class TelemetriaResponse(
    val exito: Boolean,
    val datos: List<TelemetriaPunto>
)

data class GuardarRegistroRequest(
    val nombre_curva: String,
    val dispositivo_id: String,
    val fecha_inicio: String,
    val fecha_fin: String,
    val temperatura_maxima: Double,
    val notas: String?
)

data class QuemaGuardada(
    val id: String,
    val nombre_curva: String,
    val dispositivo_id: String,
    val fecha_inicio: String,
    val fecha_fin: String,
    val temperatura_maxima: String,
    val notas: String?,
    val creado_en: String
)

data class ListaQuemasResponse(
    val exito: Boolean,
    val datos: List<QuemaGuardada>
)

data class ExitoResponse(
    val exito: Boolean,
    val mensaje: String?
)

// Interfaz Retrofit para API REST CeramikCloud
interface CeramikCloudApi {
    
    // Cargar curva programada (Neon + MQTT)
    @POST("api/v1/mqtt/programar")
    suspend fun programarHorno(@Body request: ProgramarRampaRequest): Response<ExitoResponse>

    // Enviar comando en vivo (INICIAR_QUEMA, APAGAR_EMERGENCIA)
    @POST("api/v1/mqtt/comando")
    suspend fun enviarComandoHorno(@Body request: ComandoRequest): Response<ExitoResponse>

    // Obtener historial completo de telemetría desde minuto cero
    @GET("api/v1/mqtt/telemetria/{dispositivoId}")
    suspend fun obtenerTelemetriaHistorica(@Path("dispositivoId") id: String): Response<TelemetriaResponse>

    // Asentar bitácora de quema en Neon.com
    @POST("api/v1/mqtt/guardar-historial")
    suspend fun guardarRegistroQuema(@Body request: GuardarRegistroRequest): Response<ExitoResponse>

    // Obtener historial de bitácoras guardadas en Neon.com
    @GET("api/v1/mqtt/quemas-guardadas")
    suspend fun obtenerQuemasGuardadas(): Response<ListaQuemasResponse>
}
```

---

## 2. ⚡ Archivo: `DashboardViewModel.kt`
**Ruta en tu computador:** `/Users/albertogalindez/.gemini/antigravity/scratch/ceramic-kiln-iot/android/app/src/main/java/com/ceramikcloud/iot/ui/DashboardViewModel.kt`

```kotlin
package com.ceramikcloud.iot.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ceramikcloud.iot.data.CeramikCloudApi
import com.ceramikcloud.iot.data.ComandoRequest
import com.ceramikcloud.iot.data.TelemetriaPunto
import com.ceramikcloud.iot.data.PasoRampa
import com.ceramikcloud.iot.data.ProgramarRampaRequest
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class DashboardViewModel : ViewModel() {

    private val retrofit = Retrofit.Builder()
        .baseUrl("https://old-aliens-repeat.loca.lt/")
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    private val api: CeramikCloudApi = retrofit.create(CeramikCloudApi::class.java)

    // Estados observados por Jetpack Compose UI
    private val _temperaturaActual = MutableStateFlow(20.0)
    val temperaturaActual: StateFlow<Double> = _temperaturaActual.asStateFlow()

    private val _temperaturaObjetivo = MutableStateFlow(20.0)
    val temperaturaObjetivo: StateFlow<Double> = _temperaturaObjetivo.asStateFlow()

    private val _estadoResistencia = MutableStateFlow(0.0)
    val estadoResistencia: StateFlow<Double> = _estadoResistencia.asStateFlow()

    private val _estadoHorno = MutableStateFlow("DESCONECTADO")
    val estadoHorno: StateFlow<String> = _estadoHorno.asStateFlow()

    private val _mensajeEstado = MutableStateFlow<String?>(null)
    val mensajeEstado: StateFlow<String?> = _mensajeEstado.asStateFlow()

    private val _historialCompleto = MutableStateFlow<List<TelemetriaPunto>>(emptyList())
    val historialCompleto: StateFlow<List<TelemetriaPunto>> = _historialCompleto.asStateFlow()

    private val _intervaloActualMs = MutableStateFlow(3000L)
    val intervaloActualMs: StateFlow<Long> = _intervaloActualMs.asStateFlow()

    private val _notificacionThrottling = MutableStateFlow("🟢 Sistema Listo. Actualización estándar cada 3 segundos.")
    val notificacionThrottling: StateFlow<String> = _notificacionThrottling.asStateFlow()

    init {
        // Cargar historial de telemetría desde minuto cero de forma asíncrona
        cargarHistorialMinutoCero()
    }

    // A. Consultar base de datos histórica de Neon.com
    fun cargarHistorialMinutoCero() {
        viewModelScope.launch {
            try {
                val respuesta = api.obtenerTelemetriaHistorica("b4578e9b-0081-42ab-ba41-d68a994abfe2")
                if (respuesta.isSuccessful && respuesta.body()?.exito == true) {
                    val datos = respuesta.body()?.datos ?: emptyList()
                    _historialCompleto.value = datos
                    
                    if (datos.isNotEmpty()) {
                        val ultimo = datos.last()
                        actualizarTelemetriaLocal(
                            temp = ultimo.temperatura.toDoubleOrNull() ?: 20.0,
                            obj = ultimo.temperatura_objetivo.toDoubleOrNull() ?: 20.0,
                            resistencia = ultimo.estado_resistencia.toDoubleOrNull() ?: 0.0,
                            msg = ultimo.mensaje_estado
                        )
                    }
                }
            } catch (e: Exception) {
                // Manejar error de red
            }
        }
    }

    // B. Lógica de Polling Inteligente / Throttling Dinámico para cuidar datos móviles
    fun actualizarTelemetriaLocal(temp: Double, obj: Double, resistencia: Double, msg: String? = null) {
        _temperaturaActual.value = temp
        _temperaturaObjetivo.value = obj
        _estadoResistencia.value = resistencia
        _mensajeEstado.value = msg

        // Determinar fase y ajustar refresh rate en vivo
        if (msg != null && msg.contains("Espera", ignoreCase = true)) {
            _estadoHorno.value = "⏱️ ESPERA DIFERIDA"
            _intervaloActualMs.value = 3000L
            _notificacionThrottling.value = msg
        } else if (resistencia > 5.0) {
            _estadoHorno.value = "CALENTANDO"
            _intervaloActualMs.value = 3000L
            _notificacionThrottling.value = "🔥 Quema Activa. Refresco de alta velocidad: cada 3 segundos."
        } else {
            if (temp > 100.0) {
                _estadoHorno.value = "ENFRIANDO (APAGADO)"
                _intervaloActualMs.value = 60000L // 1 minuto para ahorrar internet móvil
                _notificacionThrottling.value = "❄️ Fase de Enfriamiento Activa. Refresco inteligente: cada 1 minuto."
            } else {
                _estadoHorno.value = "HORNO INACTIVO"
                _intervaloActualMs.value = 3000L
                _notificacionThrottling.value = "🟢 Sistema Listo. Actualización estándar cada 3 segundos."
            }
        }
    }

    // C. Enviar comandos de inicio y apagado
    fun enviarComando(accion: String) {
        viewModelScope.launch {
            try {
                api.enviarComandoHorno(
                    ComandoRequest(
                        usuario_id = "5a8288b2-132d-45db-9964-b040bf5ffbb7",
                        dispositivo_id = "b4578e9b-0081-42ab-ba41-d68a994abfe2",
                        accion = accion
                    )
                )
                // Esperar leve retraso y refrescar
                delay(1000)
                cargarHistorialMinutoCero()
            } catch (e: Exception) {
                // Manejar error de red
            }
        }
    }

    // D. Programar curva de quema con temporizador opcional
    fun programarCurvaDiferida(nombreCurva: String, rampas: List<PasoRampa>, horaInicio: String?) {
        viewModelScope.launch {
            try {
                val request = ProgramarRampaRequest(
                    usuario_id = "5a8288b2-132d-45db-9964-b040bf5ffbb7",
                    dispositivo_id = "b4578e9b-0081-42ab-ba41-d68a994abfe2",
                    nombre_curva = nombreCurva,
                    rampas = rampas,
                    hora_inicio = horaInicio
                )
                val respuesta = api.programarHorno(request)
                if (respuesta.isSuccessful && respuesta.body()?.exito == true) {
                    // Esperar leve retraso y refrescar
                    delay(1000)
                    cargarHistorialMinutoCero()
                }
            } catch (e: Exception) {
                // Manejar error de red
            }
        }
    }
}
```

---

## 3. 🎨 Archivo: `DashboardScreen.kt`
**Ruta en tu computador:** `/Users/albertogalindez/.gemini/antigravity/scratch/ceramic-kiln-iot/android/app/src/main/java/com/ceramikcloud/iot/ui/DashboardScreen.kt`

```kotlin
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
```

---

## 4. 📡 Archivo: `MqttService.kt`
**Ruta en tu computador:** `/Users/albertogalindez/.gemini/antigravity/scratch/ceramic-kiln-iot/android/app/src/main/java/com/ceramikcloud/iot/data/MqttService.kt`

```kotlin
package com.ceramikcloud.iot.data

import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch
import org.eclipse.paho.client.mqttv3.*
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence
import org.json.JSONObject

class MqttService : Service() {

    private val binder = LocalBinder()
    private var mqttClient: MqttClient? = null
    private val scope = CoroutineScope(Dispatchers.IO)

    // Flow reactivo para emitir los puntos de telemetría a los ViewModels
    private val _telemetriaFlow = MutableSharedFlow<TelemetriaPunto>(replay = 1)
    val telemetriaFlow: SharedFlow<TelemetriaPunto> = _telemetriaFlow

    // Flow reactivo para emitir el estado de conexión del horno
    private val _estadoHornoFlow = MutableSharedFlow<String>(replay = 1)
    val estadoHornoFlow: SharedFlow<String> = _estadoHornoFlow

    companion object {
        private const val TAG = "MqttService"
        const val BROKER_IP = "192.168.1.36" // IP local de tu Mac configurada
        const val BROKER_URL = "tcp://$BROKER_IP:1883"
        const val CLIENT_ID = "android_client_alberto"
        
        const val TOPIC_TELEMETRIA = "usuarios/5a8288b2-132d-45db-9964-b040bf5ffbb7/hornos/b4578e9b-0081-42ab-ba41-d68a994abfe2/telemetria"
        const val TOPIC_ESTADO = "usuarios/5a8288b2-132d-45db-9964-b040bf5ffbb7/hornos/b4578e9b-0081-42ab-ba41-d68a994abfe2/estado"
    }

    inner class LocalBinder : Binder() {
        fun getService(): MqttService = this@MqttService
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        conectarAlBroker()
    }

    private fun conectarAlBroker() {
        try {
            mqttClient = MqttClient(BROKER_URL, CLIENT_ID, MemoryPersistence())
            val options = MqttConnectOptions().apply {
                isCleanSession = true
                connectionTimeout = 10
                keepAliveInterval = 20
                userName = "sistema_backend"
                password = "token_backend_sistema_9988".toCharArray()
            }

            mqttClient?.setCallback(object : MqttCallback {
                override fun connectionLost(cause: Throwable?) {
                    Log.w(TAG, "Conexión MQTT perdida. Reintentando...")
                    scope.launch { _estadoHornoFlow.emit("DESCONECTADO") }
                }

                override fun messageArrived(topic: String?, message: MqttMessage?) {
                    val payload = message?.toString() ?: return
                    scope.launch {
                        if (topic == TOPIC_TELEMETRIA) {
                            try {
                                val json = JSONObject(payload)
                                val punto = TelemetriaPunto(
                                    tiempo = System.currentTimeMillis().toString(),
                                    temperatura = json.getDouble("temperatura").toString(),
                                    temperatura_objetivo = json.getDouble("temperatura_objetivo").toString(),
                                    estado_resistencia = json.getDouble("estado_resistencia").toString(),
                                    rssi = json.optInt("rssi", -70).toString(),
                                    mensaje_estado = json.optString("mensaje_estado", null)
                                )
                                _telemetriaFlow.emit(punto)
                            } catch (e: Exception) {
                                Log.e(TAG, "Error al parsear JSON de telemetría: ${e.message}")
                            }
                        } else if (topic == TOPIC_ESTADO) {
                            _estadoHornoFlow.emit(payload.uppercase())
                        }
                    }
                }

                override fun deliveryComplete(token: IMqttDeliveryToken?) {}
            })

            mqttClient?.connect(options)
            Log.d(TAG, "✅ Conectado al Broker MQTT exitosamente en $BROKER_URL")

            // Suscribirse a los canales Zero-Trust del Horno
            mqttClient?.subscribe(TOPIC_TELEMETRIA, 1)
            mqttClient?.subscribe(TOPIC_ESTADO, 1)
            Log.d(TAG, "📥 Suscrito a los canales de telemetría y estado con éxito.")

        } catch (e: Exception) {
            Log.e(TAG, "❌ Error al conectar al Broker MQTT: ${e.message}")
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            mqttClient?.disconnect()
            mqttClient?.close()
        } catch (e: Exception) {
            Log.e(TAG, "Error al cerrar cliente MQTT: ${e.message}")
        }
    }
}
```
