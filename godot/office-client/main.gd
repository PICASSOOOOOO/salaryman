extends Node2D

## Godot renderer/input client for the authoritative Pygame office simulation.
## Pygame owns state and validates commands; this process only renders snapshots
## and sends newline-delimited JSON commands over localhost TCP.

const PROTOCOL_VERSION := 1
const WORLD_WIDTH := 10000.0
const WORLD_HEIGHT := 10000.0
const HOST := "127.0.0.1"
const PORT := 4242

var connection := StreamPeerTCP.new()
var receive_buffer := ""
var snapshot: Dictionary = {}
var connection_status := "connecting to Pygame…"
var command_sequence := 0
var visual_player_world := Vector2.ZERO
var visual_player_ready := false

func _ready() -> void:
	_connect_to_pygame()
	queue_redraw()

func _connect_to_pygame() -> void:
	var error := connection.connect_to_host(HOST, PORT)
	if error != OK:
		connection_status = "Pygame bridge unavailable · start pygame_sim first"
	else:
		connection_status = "connecting to Pygame…"

func _process(_delta: float) -> void:
	connection.poll()
	match connection.get_status():
		StreamPeerTCP.STATUS_CONNECTED:
			connection_status = "bridge live · Pygame authoritative"
			_send_current_input()
			_read_messages()
		StreamPeerTCP.STATUS_CONNECTING:
			connection_status = "connecting to Pygame…"
		_:
			connection_status = "bridge offline · press R to reconnect"
	_smooth_visual_player(_delta)
	queue_redraw()

func _read_messages() -> void:
	var available := connection.get_available_bytes()
	if available <= 0:
		return
	var result := connection.get_data(available)
	if result[0] != OK:
		return
	receive_buffer += result[1].get_string_from_utf8()
	while receive_buffer.contains("\n"):
		var newline := receive_buffer.find("\n")
		var line := receive_buffer.substr(0, newline)
		receive_buffer = receive_buffer.substr(newline + 1)
		if line.strip_edges().is_empty():
			continue
		var parsed = JSON.parse_string(line)
		if parsed is Dictionary:
			_handle_message(parsed)

func _handle_message(message: Dictionary) -> void:
	match message.get("type", ""):
		"snapshot":
			snapshot = message
		"result":
			# The next snapshot carries the authoritative notice/state.
			pass
		"error":
			connection_status = "bridge error · %s" % message.get("message", "unknown")

func _send_command(name: String, payload: Dictionary = {}) -> void:
	if connection.get_status() != StreamPeerTCP.STATUS_CONNECTED:
		return
	command_sequence += 1
	var message := {
		"type": "command",
		"version": PROTOCOL_VERSION,
		"id": "godot-%d" % command_sequence,
		"name": name,
		"payload": payload,
	}
	connection.put_data((JSON.stringify(message) + "\n").to_utf8_buffer())

func _input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo:
		return
	match event.keycode:
		KEY_E:
			_send_command("interact")
		KEY_1:
			_send_command("select_room", {"room": "lobby"})
		KEY_2:
			_send_command("select_room", {"room": "recreation"})
		KEY_3:
			_send_command("select_room", {"room": "executive"})
		KEY_SPACE:
			_send_command("toggle_running")
		KEY_N:
			_send_command("toggle_recruitment")
		KEY_B:
			_send_command("start_break", {"kind": "short"})
		KEY_T:
			_send_command("toggle_auto_breaks")
		KEY_R:
			connection.disconnect_from_host()
			connection = StreamPeerTCP.new()
			_connect_to_pygame()

func _send_current_input() -> void:
	var x := int(Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT)) - int(Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT))
	var y := int(Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN)) - int(Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP))
	_send_command("set_input", {"x": x, "y": y})

func _world_to_screen(x: float, y: float, world_rect: Rect2) -> Vector2:
	return Vector2(
		world_rect.position.x + x / WORLD_WIDTH * world_rect.size.x,
		world_rect.position.y + y / WORLD_HEIGHT * world_rect.size.y
	)

func _smooth_visual_player(delta: float) -> void:
	var scene_data: Dictionary = snapshot.get("scene", {})
	var player: Dictionary = scene_data.get("player", {})
	if player.is_empty():
		return
	var target := Vector2(float(player.get("x", 0)), float(player.get("y", 0)))
	if not visual_player_ready:
		visual_player_world = target
		visual_player_ready = true
		return
	# The target remains authoritative in Pygame; this only removes visual
	# stepping between snapshots and borrows the attached prototype's friction
	# idea without moving simulation authority into Godot.
	visual_player_world = visual_player_world.lerp(target, min(1.0, delta * 14.0))

func _accent(values: Array, fallback: Color) -> Color:
	if values.size() < 3:
		return fallback
	return Color(float(values[0]) / 255.0, float(values[1]) / 255.0, float(values[2]) / 255.0)

func _label(value: String, position: Vector2, size: int, color: Color = Color.WHITE) -> void:
	draw_string(ThemeDB.fallback_font, position, value, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)

func _draw() -> void:
	draw_rect(Rect2(0, 0, 1180, 720), Color("#07151a"), true)
	draw_rect(Rect2(24, 24, 1132, 672), Color("#0e2b32"), true)
	draw_rect(Rect2(24, 24, 1132, 672), Color("#2f8f82"), false, 2.0)
	_label("SALARYMAN / GODOT OFFICE CLIENT", Vector2(48, 62), 24, Color("#eff8df"))
	_label("authoritative Pygame simulation · polished Godot renderer", Vector2(52, 88), 12, Color("#a8c8b6"))
	_label(connection_status, Vector2(760, 62), 12, Color("#f8b957"))

	var world_rect := Rect2(48, 112, 792, 500)
	draw_rect(world_rect, Color("#082027"), true)
	draw_rect(world_rect, Color("#3b9b8b"), false, 1.0)
	_draw_world(world_rect)
	_draw_sidebar()
	_draw_footer()

func _draw_world(world_rect: Rect2) -> void:
	var scene_data: Dictionary = snapshot.get("scene", {})
	var rooms: Array = scene_data.get("rooms", [])
	for room in rooms:
		var room_pos := _world_to_screen(float(room.get("x", 0)), float(room.get("y", 0)), world_rect)
		var room_size := Vector2(
			float(room.get("width", 1)) / WORLD_WIDTH * world_rect.size.x,
			float(room.get("height", 1)) / WORLD_HEIGHT * world_rect.size.y
		)
		var color := _accent(room.get("accent", []), Color("#234f55"))
		if room.get("id", "") != scene_data.get("room", ""):
			color = color.darkened(0.45)
		draw_rect(Rect2(room_pos, room_size), color, true)
		draw_rect(Rect2(room_pos, room_size), Color("#70c7af"), false, 1.0)
		_label(str(room.get("label", "")), room_pos + Vector2(8, 20), 11, Color("#eff8df"))

	for item in scene_data.get("objects", []):
		if item.get("room", "") != scene_data.get("room", "") and item.get("room", "") != "public":
			continue
		var object_pos := _world_to_screen(float(item.get("x", 0)), float(item.get("y", 0)), world_rect)
		var object_color := Color("#f8b957") if item.get("nearby", false) else Color("#47be9a")
		draw_circle(object_pos, 7.0 if item.get("nearby", false) else 5.0, object_color)
		if item.get("nearby", false):
			_label(str(item.get("label", "")), object_pos + Vector2(10, 4), 11, Color("#f8b957"))

	var player_pos := _world_to_screen(visual_player_world.x, visual_player_world.y, world_rect)
	draw_circle(player_pos, 11.0, Color("#f07767"))
	draw_circle(player_pos, 4.0, Color("#eff8df"))

func _draw_sidebar() -> void:
	var sidebar := Rect2(864, 112, 260, 500)
	draw_rect(sidebar, Color("#eff8df"), true)
	draw_rect(sidebar, Color("#a4d0a9"), false, 2.0)
	var scene_data: Dictionary = snapshot.get("scene", {})
	var office: Dictionary = snapshot.get("office", {})
	var workers: Array = office.get("workers", [])
	_label("OFFICE STATUS", sidebar.position + Vector2(20, 34), 15, Color("#112d30"))
	_label("FLOOR %02d  ·  %s" % [int(scene_data.get("floor", 1)), str(scene_data.get("room", "offline")).to_upper()], sidebar.position + Vector2(20, 64), 12, Color("#24675b"))
	_label("AVAILABLE", sidebar.position + Vector2(20, 106), 10, Color("#5d837d"))
	_label("ƒ%.2f" % float(office.get("funds", 0.0)), sidebar.position + Vector2(20, 132), 22, Color("#47be9a"))
	_label(str(office.get("time", "WAITING FOR SNAPSHOT")), sidebar.position + Vector2(20, 164), 12, Color("#112d30"))
	_label("ROSTER  %d" % workers.size(), sidebar.position + Vector2(20, 196), 12, Color("#112d30"))
	_label("NOTICE", sidebar.position + Vector2(20, 242), 10, Color("#5d837d"))
	_label(str(office.get("notice", "WAITING FOR PYGAME")), sidebar.position + Vector2(20, 266), 12, Color("#d06b5b"))
	_label("WASD / ARROWS  MOVE", sidebar.position + Vector2(20, 330), 11, Color("#112d30"))
	_label("E  INTERACT", sidebar.position + Vector2(20, 352), 11, Color("#112d30"))
	_label("1/2/3  CHANGE ROOM", sidebar.position + Vector2(20, 374), 11, Color("#112d30"))
	_label("SPACE  PAUSE · N  HIRING", sidebar.position + Vector2(20, 396), 11, Color("#112d30"))
	_label("R  RECONNECT", sidebar.position + Vector2(20, 440), 11, Color("#24675b"))

func _draw_footer() -> void:
	var office: Dictionary = snapshot.get("office", {})
	var shift_label := "SHIFT RUNNING" if office.get("running", false) else "SHIFT PAUSED"
	draw_rect(Rect2(48, 632, 1076, 40), Color("#07151a"), true)
	_label(
		"PYGAME AUTHORITY  ·  %s  ·  GODOT PRESENTATION ONLY" % shift_label,
		Vector2(66, 657),
		11,
		Color("#a8c8b6")
	)