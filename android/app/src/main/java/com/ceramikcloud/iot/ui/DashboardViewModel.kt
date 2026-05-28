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
