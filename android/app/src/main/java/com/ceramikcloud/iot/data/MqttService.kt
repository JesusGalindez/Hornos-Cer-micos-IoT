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
