// MIDI keyboards over USB and Bluetooth LE, through android.media.midi.
// Opens every keyboard that shows up, and reports each key with the
// System.nanoTime() stamp the MIDI stack gave it, so timing is judged from
// when the key was hit, not from when this code ran.

package io.chordtrainer.ghostjam.midi

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiManager
import android.media.midi.MidiOutputPort
import android.media.midi.MidiReceiver
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

data class Key(val midi: Int, val velocity: Int, val down: Boolean, val nanos: Long)

class MidiInput(private val context: Context, private val onKey: (Key) -> Unit) {
    private val manager = context.getSystemService(Context.MIDI_SERVICE) as MidiManager
    private val main = Handler(Looper.getMainLooper())
    private val open = mutableMapOf<Int, Pair<MidiDevice, MidiOutputPort>>()

    // Name of the keyboard in use, or null.
    private val _device = MutableStateFlow<String?>(null)
    val device: StateFlow<String?> = _device
    private val _scanning = MutableStateFlow(false)
    val scanning: StateFlow<Boolean> = _scanning

    private val callback = object : MidiManager.DeviceCallback() {
        override fun onDeviceAdded(info: MidiDeviceInfo) = openDevice(info)
        override fun onDeviceRemoved(info: MidiDeviceInfo) {
            open.remove(info.id)?.let { (d, p) -> p.close(); d.close() }
            refreshName()
        }
    }

    @Suppress("DEPRECATION")
    fun start() {
        manager.registerDeviceCallback(callback, main)
        manager.devices.forEach(::openDevice)
    }

    fun stop() {
        manager.unregisterDeviceCallback(callback)
        stopScan()
        open.values.forEach { (d, p) -> p.close(); d.close() }
        open.clear()
        refreshName()
    }

    private fun openDevice(info: MidiDeviceInfo) {
        if (info.id in open || info.outputPortCount == 0) return
        manager.openDevice(info, { it?.let(::attach) }, main)
    }

    private fun attach(device: MidiDevice) {
        val id = device.info.id
        if (id in open) return device.close()
        val port = device.openOutputPort(0) ?: return device.close()
        port.connect(Parser())
        open[id] = device to port
        refreshName()
    }

    private fun refreshName() {
        _device.value = open.values.firstOrNull()?.first?.info?.properties
            ?.getString(MidiDeviceInfo.PROPERTY_NAME)
    }

    // Note on and off from the raw bytes, running status included.
    private inner class Parser : MidiReceiver() {
        private var status = 0
        private val data = IntArray(2)
        private var count = 0

        override fun onSend(msg: ByteArray, offset: Int, length: Int, timestamp: Long) {
            for (i in offset until offset + length) {
                val b = msg[i].toInt() and 0xFF
                if (b >= 0xF8) continue                    // clock, active sensing
                if (b >= 0x80) { status = b; count = 0; continue }
                if (status == 0) continue
                data[count++] = b
                if (count < 2) continue
                count = 0
                when (status and 0xF0) {
                    0x90 -> onKey(Key(data[0], data[1], data[1] > 0, timestamp))
                    0x80 -> onKey(Key(data[0], 0, false, timestamp))
                }
            }
        }
    }

    // ---- Bluetooth LE MIDI: scan for the standard service, then open ----

    private var scanner: ScanCallback? = null

    @SuppressLint("MissingPermission")
    fun scanBluetooth() {
        val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter ?: return
        val le = adapter.bluetoothLeScanner ?: return
        if (scanner != null) return
        val cb = object : ScanCallback() {
            override fun onScanResult(type: Int, result: ScanResult) {
                stopScan()
                manager.openBluetoothDevice(result.device, { it?.let(::attach) }, main)
            }
            override fun onScanFailed(errorCode: Int) { stopScan() }
        }
        scanner = cb
        _scanning.value = true
        val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid.fromString(BLE_MIDI_SERVICE)).build()
        le.startScan(listOf(filter), ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), cb)
        main.postDelayed({ stopScan() }, 15_000)
    }

    @SuppressLint("MissingPermission")
    fun stopScan() {
        val cb = scanner ?: return
        scanner = null
        _scanning.value = false
        val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
        adapter?.bluetoothLeScanner?.stopScan(cb)
    }

    companion object {
        const val BLE_MIDI_SERVICE = "03B80E5A-EDE8-4B33-A751-6CE34EC4C700"
    }
}
