extends Node

const SAMPLE_RATE := 22050
const DURATION_SECONDS := 0.14
const PEAK_AMPLITUDE := 5200.0

var player: AudioStreamPlayer
var zoom_in_stream: AudioStreamWAV
var zoom_out_stream: AudioStreamWAV


func _ready() -> void:
	player = AudioStreamPlayer.new()
	player.name = "ZoomPlayer"
	player.volume_db = -16.0
	if AudioServer.get_bus_index("SFX") >= 0:
		player.bus = "SFX"
	else:
		player.bus = "Master"
	add_child(player)
	zoom_in_stream = make_zoom_tone(true)
	zoom_out_stream = make_zoom_tone(false)


func play_zoom(zooming_in: bool) -> void:
	if not is_instance_valid(player):
		return
	player.stream = zoom_in_stream if zooming_in else zoom_out_stream
	player.play()


static func make_zoom_tone(zooming_in: bool) -> AudioStreamWAV:
	var sample_count := roundi(DURATION_SECONDS * SAMPLE_RATE)
	var pcm := PackedByteArray()
	pcm.resize(sample_count * 2)
	var phase := 0.0
	for index in range(sample_count):
		var progress := float(index) / float(sample_count - 1)
		var frequency := lerpf(430.0, 780.0, progress)
		if not zooming_in:
			frequency = lerpf(780.0, 430.0, progress)
		var envelope := pow(sin(PI * progress), 1.45)
		var fundamental := sin(phase)
		var overtone := sin(phase * 2.01) * 0.13
		var value := roundi((fundamental * 0.72 + overtone) * envelope * PEAK_AMPLITUDE)
		pcm.encode_s16(index * 2, clampi(value, -32768, 32767))
		phase += TAU * frequency / SAMPLE_RATE

	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = SAMPLE_RATE
	stream.stereo = false
	stream.data = pcm
	return stream
