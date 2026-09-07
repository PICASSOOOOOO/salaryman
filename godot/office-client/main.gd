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
var pixel_textures: Dictionary = {}
var animation_clock := 0.0
var facing_row := 0

func _ready() -> void:
	_load_pixel_art()
	_connect_to_pygame()
	queue_redraw()

func _load_pixel_art() -> void:
	pixel_textures["player"] = load("res://pixel-agents/assets/characters/char_0.png")
	pixel_textures["wall"] = load("res://pixel-agents/walls/wall_0.png")
	pixel_textures["bookshelf"] = load("res://pixel-agents/assets/furniture/BOOKSHELF/BOOKSHELF.png")
	pixel_textures["desk"] = load("res://pixel-agents/assets/furniture/DESK/DESK_FRONT.png")
	pixel_textures["pc"] = load("res://pixel-agents/assets/furniture/PC/PC_FRONT_ON_1.png")
	pixel_textures["plant"] = load("res://pixel-agents/assets/furniture/PLANT/PLANT.png")
	pixel_textures["sofa"] = load("res://pixel-agents/assets/furniture/SOFA/SOFA_FRONT.png")
	pixel_textures["whiteboard"] = load("res://pixel-agents/assets/furniture/WHITEBOARD/WHITEBOARD.png")

func _connect_to_pygame() -> void:
	var error := connection.connect_to_host(HOST, PORT)
	if error != OK:
		connection_status = "Pygame bridge unavailable · start pygame_sim first"
	else:
		connection_status = "connecting to Pygame…"

func _process(delta: float) -> void:
	animation_clock += delta
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
	if abs(x) > abs(y) and x != 0:
		facing_row = 2 if x > 0 else 1
	elif y != 0:
		facing_row = 0 if y > 0 else 3
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
	var room: Dictionary = {}
	for candidate in rooms:
		if candidate.get("id", "") == scene_data.get("room", ""):
			room = candidate
			break
	if room.is_empty():
		draw_rect(world_rect, Color("#cbaa76"), true)
		return

	var room_x := float(room.get("x", 0))
	var room_y := float(room.get("y", 0))
	var room_w := float(room.get("width", 1))
	var room_h := float(room.get("height", 1))
	var zoom := 0.30
	var view_w := world_rect.size.x / zoom
	var view_h := world_rect.size.y / zoom
	var camera_x := clamp(visual_player_world.x - view_w / 2.0, room_x, room_x + room_w - view_w)
	var camera_y := clamp(visual_player_world.y - view_h / 2.0, room_y, room_y + room_h - view_h)

	draw_rect(world_rect, Color("#bf9b6c"), true)
	var tile_size := 24
	for row in range(0, int(world_rect.size.y / tile_size) + 1):
		for col in range(0, int(world_rect.size.x / tile_size) + 1):
			var tile_color := Color("#d6b77e") if (row + col) % 2 == 0 else Color("#cbaa76")
			var tile_rect := Rect2(world_rect.position + Vector2(col * tile_size, row * tile_size), Vector2(tile_size, tile_size))
			draw_rect(tile_rect, tile_color, true)
			draw_line(tile_rect.position + Vector2(0, tile_size - 1), tile_rect.position + Vector2(tile_size, tile_size - 1), Color("#a47d55"), 1.0)

	var inner := world_rect.grow(-18)
	draw_rect(inner, Color("#6f5c47"), true)
	draw_rect(inner.grow(-8), Color("#cbaa76"), true)
	var wall_texture: Texture2D = pixel_textures.get("wall")
	if wall_texture:
		for x in range(int(inner.position.x), int(inner.end.x), 32):
			draw_texture_rect(wall_texture, Rect2(x, inner.position.y - 12, 32, 64), false)
			draw_texture_rect(wall_texture, Rect2(x, inner.end.y - 20, 32, 64), false)

	var room_id := str(scene_data.get("room", "lobby"))
	var furniture := {
		"lobby": [["bookshelf", 1050.0, 1250.0, Vector2(86, 44)], ["plant", 3500.0, 1400.0, Vector2(42, 84)], ["sofa", 2400.0, 3500.0, Vector2(86, 44)], ["whiteboard", 3050.0, 1400.0, Vector2(86, 86)]],
		"recreation": [["sofa", 2500.0, 5550.0, Vector2(86, 44)], ["plant", 7300.0, 5550.0, Vector2(42, 84)], ["bookshelf", 8200.0, 5550.0, Vector2(86, 44)]],
		"executive": [["desk", 6200.0, 1800.0, Vector2(128, 86)], ["bookshelf", 7600.0, 1450.0, Vector2(86, 44)], ["plant", 8200.0, 3300.0, Vector2(42, 84)], ["whiteboard", 5700.0, 1350.0, Vector2(86, 86)]],
	}
	for item in furniture.get(room_id, []):
		var texture: Texture2D = pixel_textures.get(str(item[0]))
		if texture:
			var point := _world_point(world_rect, camera_x, camera_y, zoom, float(item[1]), float(item[2]))
			draw_texture_rect(texture, Rect2(point - item[3] / 2.0, item[3]), false)

	for item in scene_data.get("objects", []):
		if item.get("room", "") != room_id:
			continue
		var object_pos := _world_point(world_rect, camera_x, camera_y, zoom, float(item.get("x", 0)), float(item.get("y", 0)))
		var object_texture: Texture2D = _texture_for_object(str(item.get("kind", "")))
		if object_texture:
			draw_texture_rect(object_texture, Rect2(object_pos - Vector2(20, 20), Vector2(40, 40)), false)
		else:
			draw_circle(object_pos, 8.0, Color("#47be9a"))
		if item.get("nearby", false):
			draw_circle(object_pos, 23.0, Color("#f8b957"), false, 2.0)
			_label("[E] " + str(item.get("label", "")), object_pos + Vector2(26, 4), 11, Color("#fff0ae"))

	var player_pos := _world_point(world_rect, camera_x, camera_y, zoom, visual_player_world.x, visual_player_world.y)
	_draw_player_sprite(player_pos)
	_label(str(room.get("label", "")).to_upper(), world_rect.position + Vector2(18, 28), 20, Color("#fff4ca"))

func _world_point(world_rect: Rect2, camera_x: float, camera_y: float, zoom: float, x: float, y: float) -> Vector2:
	return world_rect.position + Vector2((x - camera_x) * zoom, (y - camera_y) * zoom)

func _texture_for_object(kind: String) -> Texture2D:
	match kind:
		"desk":
			return pixel_textures.get("desk")
		"crt_terminal", "tv", "arcade", "vending_machine", "atm":
			return pixel_textures.get("pc")
		"window":
			return pixel_textures.get("whiteboard")
		"telephone", "pay_phone":
			return pixel_textures.get("pc")
		_:
			return null

func _draw_player_sprite(position: Vector2) -> void:
	var player: Texture2D = pixel_textures.get("player")
	if not player:
		draw_circle(position, 12.0, Color("#f07767"))
		return
	var frame := int(animation_clock * 8.0) % 4
	var source := Rect2(frame * 16, facing_row * 24, 16, 24)
	draw_ellipse_shadow(position + Vector2(0, 25), Vector2(18, 7))
	draw_texture_rect_region(player, Rect2(position - Vector2(18, 42), Vector2(36, 54)), source)

func draw_ellipse_shadow(center: Vector2, radius: Vector2) -> void:
	draw_set_transform(center, 0.0, radius)
	draw_circle(Vector2.ZERO, 1.0, Color(0.10, 0.18, 0.17, 0.55))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

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