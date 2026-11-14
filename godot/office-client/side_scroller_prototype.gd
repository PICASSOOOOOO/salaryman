extends Node2D

## An additive 2.5D view experiment. Python remains authoritative for movement,
## collisions, interactions, and floor access; this scene only projects snapshots.

const PROTOCOL_VERSION := 1
const HOST := "127.0.0.1"
const PORT := 4242
const DESIGN_SIZE := Vector2(1180.0, 720.0)
const CHARACTER_SHEET: Texture2D = preload("res://pixel-agents/assets/characters/char_0.png")
const DESK_SPRITE: Texture2D = preload("res://pixel-agents/assets/furniture/DESK/DESK_FRONT.png")
const SOFA_SPRITE: Texture2D = preload("res://pixel-agents/assets/furniture/SOFA/SOFA_FRONT.png")
const BOOKSHELF_SPRITE: Texture2D = preload("res://pixel-agents/assets/furniture/BOOKSHELF/BOOKSHELF.png")
const PLANT_SPRITE: Texture2D = preload("res://pixel-agents/assets/furniture/PLANT/PLANT.png")
const PC_SPRITE: Texture2D = preload("res://pixel-agents/assets/furniture/PC/PC_FRONT_ON_1.png")

const ACTIVE_FLOOR_Y := 510.0
const FLOOR_SPACING := 156.0
const DEPTH_LANE_HEIGHT := 90.0
const WORLD_VIEW_LEFT := 72.0
const INPUT_SEND_INTERVAL := 0.12
const JUMP_DURATION := 0.72

var connection := StreamPeerTCP.new()
var receive_buffer := ""
var snapshot: Dictionary = {}
var scene_data: Dictionary = {}
var command_sequence := 0
var pending_commands: Dictionary = {}
var held_keys: Dictionary = {}
var send_elapsed := 0.0
var animation_clock := 0.0
var bridge_status := "CONNECTING TO PYTHON SIMULATION…"
var bridge_connection_logged := false
var last_snapshot_floor := -1
var notice := "Starting on the playable Floor 06"
var notice_remaining := 3.0
var player_world_position := Vector2.ZERO
var target_player_world_position := Vector2.ZERO
var has_player_snapshot := false
var facing_left := false
var jump_elapsed := -1.0
var pending_floor := -1
var last_viewport_size := Vector2.ZERO

var player_sprite: Sprite2D


static func project_world_position(
	world_position: Vector2,
	room_bounds: Rect2,
	view_width: float,
	floor_y: float,
	depth_pixels: float = DEPTH_LANE_HEIGHT,
) -> Vector2:
	var room_width := maxf(room_bounds.size.x, 1.0)
	var room_height := maxf(room_bounds.size.y, 1.0)
	var x_ratio := clampf((world_position.x - room_bounds.position.x) / room_width, 0.0, 1.0)
	var y_ratio := clampf((world_position.y - room_bounds.position.y) / room_height, 0.0, 1.0)
	var right_edge := maxf(WORLD_VIEW_LEFT + 1.0, view_width - 270.0)
	return Vector2(
		lerpf(WORLD_VIEW_LEFT, right_edge, x_ratio),
		floor_y - 15.0 - y_ratio * depth_pixels,
	)


static func adjacent_floor(current_floor: int, direction: int) -> int:
	return current_floor + clampi(direction, -1, 1)


func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_layout_design_space()
	_configure_player_sprite()
	var error := connection.connect_to_host(HOST, PORT)
	if error != OK:
		bridge_status = "PYTHON BRIDGE UNAVAILABLE · %s" % error_string(error)
	set_process(true)
	queue_redraw()


func _configure_player_sprite() -> void:
	player_sprite = Sprite2D.new()
	player_sprite.name = "PixelPlayer"
	player_sprite.texture = CHARACTER_SHEET
	player_sprite.hframes = 7
	player_sprite.vframes = 3
	# One fixed appearance in the right-facing row; movement uses a small bob,
	# never a different identity column.
	player_sprite.frame = 14
	player_sprite.centered = true
	player_sprite.scale = Vector2(2.6, 2.6)
	player_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	player_sprite.z_index = 20
	add_child(player_sprite)


func _process(delta: float) -> void:
	animation_clock += delta
	var viewport_size := get_viewport_rect().size
	if viewport_size != last_viewport_size:
		_layout_design_space()
	connection.poll()
	if connection.get_status() == StreamPeerTCP.STATUS_CONNECTED:
		bridge_status = "PYTHON SIMULATION LINKED"
		if not bridge_connection_logged:
			print("Side-view prototype connected to the Python simulation bridge.")
			bridge_connection_logged = true
		_read_messages()
		send_elapsed += delta
		if send_elapsed >= INPUT_SEND_INTERVAL:
			send_elapsed = 0.0
			_send_current_input()
	elif connection.get_status() == StreamPeerTCP.STATUS_CONNECTING:
		bridge_status = "CONNECTING TO PYTHON SIMULATION…"
	else:
		bridge_status = "PYTHON BRIDGE OFFLINE · RESTART THE PROTOTYPE"

	if notice_remaining > 0.0:
		notice_remaining = maxf(0.0, notice_remaining - delta)
	if jump_elapsed >= 0.0:
		jump_elapsed += delta
		if jump_elapsed >= JUMP_DURATION:
			jump_elapsed = -1.0

	if has_player_snapshot:
		player_world_position = player_world_position.lerp(
			target_player_world_position,
			clampf(delta * 12.0, 0.0, 1.0),
		)
		_update_player_sprite()
	queue_redraw()


func _layout_design_space() -> void:
	var viewport_size := get_viewport_rect().size
	if viewport_size.x <= 0.0 or viewport_size.y <= 0.0:
		return
	var scale_factor := minf(
		viewport_size.x / DESIGN_SIZE.x,
		viewport_size.y / DESIGN_SIZE.y,
	)
	scale = Vector2.ONE * scale_factor
	position = (viewport_size - DESIGN_SIZE * scale_factor) / 2.0
	last_viewport_size = viewport_size


func _update_player_sprite() -> void:
	if player_sprite == null:
		return
	var point := _world_to_screen(player_world_position)
	var walking := not _movement_input().is_zero_approx()
	var bob := sin(animation_clock * 14.0) * 1.5 if walking else 0.0
	var jump_height := 0.0
	if jump_elapsed >= 0.0:
		var phase := clampf(jump_elapsed / JUMP_DURATION, 0.0, 1.0)
		jump_height = sin(phase * PI) * 64.0
	player_sprite.position = Vector2(point.x, point.y - 16.0 - jump_height + bob)
	player_sprite.flip_h = facing_left


func _input(event: InputEvent) -> void:
	if not event is InputEventKey:
		return
	var key_event := event as InputEventKey
	var movement_keys := [
		KEY_A, KEY_D, KEY_W, KEY_S,
		KEY_LEFT, KEY_RIGHT, KEY_UP, KEY_DOWN,
		KEY_SHIFT,
	]
	if key_event.keycode in movement_keys:
		if key_event.pressed:
			held_keys[key_event.keycode] = true
		else:
			held_keys.erase(key_event.keycode)
		return
	if not key_event.pressed or key_event.echo:
		return
	match key_event.keycode:
		KEY_E:
			_interact()
		KEY_SPACE:
			_jump()
		KEY_PAGEUP:
			_select_adjacent_floor(1)
		KEY_PAGEDOWN:
			_select_adjacent_floor(-1)
		KEY_R:
			_reconnect()


func _movement_input() -> Vector2:
	var x := float(_is_key_held(KEY_D) or _is_key_held(KEY_RIGHT))
	x -= float(_is_key_held(KEY_A) or _is_key_held(KEY_LEFT))
	var y := float(_is_key_held(KEY_S) or _is_key_held(KEY_DOWN))
	y -= float(_is_key_held(KEY_W) or _is_key_held(KEY_UP))
	var movement := Vector2(x, y).limit_length(1.0)
	if movement.x < -0.1:
		facing_left = true
	elif movement.x > 0.1:
		facing_left = false
	return movement


func _is_key_held(keycode: int) -> bool:
	return bool(held_keys.get(keycode, false)) or Input.is_key_pressed(keycode)


func _send_current_input() -> void:
	if not scene_data.is_empty() and _page_is_open():
		_send_command("set_input", {"x": 0.0, "y": 0.0, "sprint": false})
		return
	var movement := _movement_input()
	_send_command(
		"set_input",
		{
			"x": movement.x,
			"y": movement.y,
			"sprint": _is_key_held(KEY_SHIFT),
		},
	)


func _page_is_open() -> bool:
	var office_value: Variant = snapshot.get("office", {})
	if not office_value is Dictionary:
		return false
	var active_page: Variant = office_value.get("activePage", "")
	return active_page is String and not active_page.is_empty()


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
		var parsed: Variant = JSON.parse_string(line)
		if parsed is Dictionary:
			_handle_message(parsed)


func _handle_message(message: Dictionary) -> void:
	match str(message.get("type", "")):
		"snapshot":
			snapshot = message
			var scene_value: Variant = message.get("scene", {})
			if scene_value is Dictionary:
				scene_data = scene_value
				var snapshot_floor := int(scene_data.get("floor", 0))
				if snapshot_floor != last_snapshot_floor:
					print(
						"Side-view prototype live floor: %02d / %s."
						% [snapshot_floor, str(scene_data.get("room", "unknown"))]
					)
					last_snapshot_floor = snapshot_floor
				var player_value: Variant = scene_data.get("player", {})
				if player_value is Dictionary:
					var next_position := Vector2(
						float(player_value.get("x", 0.0)),
						float(player_value.get("y", 0.0)),
					)
					if not has_player_snapshot:
						player_world_position = next_position
						target_player_world_position = next_position
					else:
						target_player_world_position = next_position
					has_player_snapshot = true
				if pending_floor == int(scene_data.get("floor", -1)):
					pending_floor = -1
					notice = "ARRIVED ON FLOOR %02d" % int(scene_data.get("floor", 1))
					notice_remaining = 2.5
		"result":
			var command_id := str(message.get("id", ""))
			var command_name := str(pending_commands.get(command_id, ""))
			pending_commands.erase(command_id)
			if command_name == "set_input":
				return
			if bool(message.get("ok", false)):
				notice = str(message.get("message", "ACTION COMPLETE"))
			else:
				notice = str(message.get("message", "ACTION FAILED"))
			notice_remaining = 3.0
			if pending_floor >= 0 and not bool(message.get("ok", false)):
				pending_floor = -1


func _send_command(command_name: String, payload: Dictionary = {}) -> String:
	if connection.get_status() != StreamPeerTCP.STATUS_CONNECTED:
		return ""
	command_sequence += 1
	var command_id := "side-view-%d" % command_sequence
	var message := {
		"type": "command",
		"version": PROTOCOL_VERSION,
		"id": command_id,
		"name": command_name,
		"payload": payload,
	}
	pending_commands[command_id] = command_name
	connection.put_data((JSON.stringify(message) + "\n").to_utf8_buffer())
	return command_id


func _interact() -> void:
	if scene_data.is_empty():
		_set_notice("WAITING FOR THE SIMULATION")
		return
	for object_value in scene_data.get("objects", []):
		if object_value is Dictionary and bool(object_value.get("nearby", false)):
			_send_command("interact", {"object_id": str(object_value.get("id", ""))})
			return
	_set_notice("MOVE CLOSER TO AN INTERACTIVE OBJECT")


func _jump() -> void:
	if connection.get_status() != StreamPeerTCP.STATUS_CONNECTED:
		return
	_send_command("set_action", {"action": "jump"})
	jump_elapsed = 0.0


func _select_adjacent_floor(direction: int) -> void:
	if scene_data.is_empty() or pending_floor >= 0:
		return
	var current_floor := int(scene_data.get("floor", 6))
	var destination := adjacent_floor(current_floor, direction)
	pending_floor = destination
	_set_notice("REQUESTING FLOOR %02d" % destination)
	_send_command("select_floor", {"floor": destination})


func _reconnect() -> void:
	connection.disconnect_from_host()
	receive_buffer = ""
	var error := connection.connect_to_host(HOST, PORT)
	bridge_status = "CONNECTING TO PYTHON SIMULATION…" if error == OK else error_string(error)


func _set_notice(message: String) -> void:
	notice = message
	notice_remaining = 2.8


func _current_room_bounds() -> Rect2:
	var room_id := str(scene_data.get("room", ""))
	var rooms_value: Variant = scene_data.get("rooms", [])
	if rooms_value is Array:
		for room_value in rooms_value:
			if room_value is Dictionary and str(room_value.get("id", "")) == room_id:
				var room: Dictionary = room_value
				return Rect2(
					Vector2(float(room.get("x", 0)), float(room.get("y", 0))),
					Vector2(float(room.get("width", 1)), float(room.get("height", 1))),
				)
	return Rect2(0.0, 0.0, 62225.0, 70711.0)


func _world_to_screen(world_position: Vector2) -> Vector2:
	return project_world_position(
		world_position,
		_current_room_bounds(),
		DESIGN_SIZE.x,
		ACTIVE_FLOOR_Y,
		DEPTH_LANE_HEIGHT,
	)


func _draw() -> void:
	var size := DESIGN_SIZE
	draw_rect(Rect2(Vector2.ZERO, size), Color("#dce9d1"))
	_draw_backdrop(size)
	_draw_floor_stack(size)
	_draw_active_room(size)
	_draw_hud(size)


func _draw_backdrop(size: Vector2) -> void:
	draw_rect(Rect2(0.0, 0.0, size.x, 82.0), Color("#315f52"))
	draw_line(Vector2(0.0, 82.0), Vector2(size.x, 82.0), Color("#85a776"), 2.0)
	for index in range(6):
		var x := 70.0 + float(index) * 145.0
		draw_rect(Rect2(x, 145.0, 86.0, 110.0), Color("#789d72"))
		draw_rect(Rect2(x + 8.0, 153.0, 70.0, 91.0), Color("#b9e5d6"))
		draw_rect(Rect2(x + 13.0, 158.0, 60.0, 81.0), Color("#caeee0"))
		draw_line(Vector2(x + 43.0, 153.0), Vector2(x + 43.0, 244.0), Color("#6a9c86"), 2.0)
		draw_line(Vector2(x + 8.0, 206.0), Vector2(x + 78.0, 206.0), Color("#6a9c86"), 2.0)
	draw_rect(Rect2(0.0, size.y - 26.0, size.x, 26.0), Color("#315f52"))


func _draw_floor_stack(size: Vector2) -> void:
	var current_floor := int(scene_data.get("floor", 6))
	var shaft := Rect2(size.x - 205.0, 128.0, 160.0, size.y - 172.0)
	draw_rect(shaft, Color("#d2e6ca"))
	draw_rect(shaft, Color("#6a9673"), false, 3.0)
	draw_line(Vector2(shaft.position.x + 24.0, shaft.position.y), Vector2(shaft.position.x + 24.0, shaft.end.y), Color("#7c9f74"), 3.0)
	draw_line(Vector2(shaft.end.x - 24.0, shaft.position.y), Vector2(shaft.end.x - 24.0, shaft.end.y), Color("#7c9f74"), 3.0)

	for offset in [-1, 0, 1]:
		var floor_number := current_floor + int(offset)
		var floor_y := ACTIVE_FLOOR_Y - float(offset) * FLOOR_SPACING
		var active := int(offset) == 0
		var beam_color := Color("#d7b46a") if active else Color("#8ba482")
		draw_rect(Rect2(58.0, floor_y, shaft.position.x - 58.0, 13.0), beam_color)
		draw_rect(Rect2(58.0, floor_y + 13.0, shaft.position.x - 58.0, 72.0), Color("#efe8c9") if active else Color("#d3dfc4"))
		draw_line(Vector2(58.0, floor_y + 85.0), Vector2(shaft.position.x, floor_y + 85.0), Color("#8a7552"), 2.0)
		var label_color := Color("#315f52") if active else Color("#607961")
		if not active:
			_draw_text("FLOOR %02d" % floor_number, Vector2(72.0, floor_y - 14.0), 10, label_color)
		var car_y := floor_y - 67.0
		draw_rect(Rect2(shaft.position.x + 43.0, car_y, 73.0, 61.0), Color("#b4d5bd") if active else Color("#c2d8b9"))
		draw_rect(Rect2(shaft.position.x + 43.0, car_y, 73.0, 61.0), beam_color if active else Color("#7b9872"), false, 2.0)
		draw_line(Vector2(shaft.position.x + 79.0, car_y + 5.0), Vector2(shaft.position.x + 79.0, car_y + 57.0), Color("#6a9673"), 2.0)
		if active:
			draw_rect(Rect2(shaft.position.x + 127.0, floor_y - 49.0, 11.0, 20.0), Color("#eea84f"))

	_draw_text("TOWER LIFT", Vector2(shaft.position.x + 24.0, 112.0), 10, Color("#315f52"))
	_draw_text("PGUP / PGDN", Vector2(shaft.position.x + 25.0, size.y - 31.0), 9, Color("#315f52"))


func _draw_active_room(_size: Vector2) -> void:
	if scene_data.is_empty():
		return
	var player_point := _world_to_screen(player_world_position)
	draw_circle(player_point + Vector2(0.0, 8.0), 9.0, Color(0.12, 0.22, 0.16, 0.24))
	var room_bounds := _current_room_bounds()
	var objects_value: Variant = scene_data.get("objects", [])
	if not objects_value is Array:
		return
	for object_value in objects_value:
		if not object_value is Dictionary:
			continue
		var item: Dictionary = object_value
		var world_position := Vector2(
			float(item.get("displayX", item.get("x", 0))),
			float(item.get("displayY", item.get("y", 0))),
		)
		var screen_position := project_world_position(
			world_position,
			room_bounds,
			get_viewport_rect().size.x,
			ACTIVE_FLOOR_Y,
			DEPTH_LANE_HEIGHT,
		)
		_draw_world_object(item, screen_position)


func _draw_world_object(item: Dictionary, screen_position: Vector2) -> void:
	var kind := str(item.get("kind", ""))
	if kind in ["partition_h", "partition_v", "pallet", "supply_crate"]:
		return
	var sprite := _sprite_for_kind(kind)
	var nearby := bool(item.get("nearby", false))
	if sprite != null:
		var image_size := sprite.get_size()
		var scale := 1.2
		var rect := Rect2(
			screen_position.x - image_size.x * scale / 2.0,
			screen_position.y - image_size.y * scale,
			image_size.x * scale,
			image_size.y * scale,
		)
		draw_texture_rect(sprite, rect, false)
	else:
		var tint := Color("#df9d43") if nearby else Color("#537d61")
		if kind in ["elevator", "stairs", "basement_stairs"]:
			draw_rect(Rect2(screen_position.x - 12.0, screen_position.y - 38.0, 24.0, 38.0), Color("#b9d4b4"))
			draw_rect(Rect2(screen_position.x - 12.0, screen_position.y - 38.0, 24.0, 38.0), tint, false, 2.0)
			_draw_text("LIFT" if kind == "elevator" else "STAIRS", screen_position + Vector2(-22.0, -44.0), 8, tint)
		else:
			draw_rect(Rect2(screen_position.x - 9.0, screen_position.y - 18.0, 18.0, 18.0), tint)
			draw_rect(Rect2(screen_position.x - 9.0, screen_position.y - 18.0, 18.0, 18.0), Color("#173637"), false, 1.0)
	if nearby:
		draw_circle(screen_position + Vector2(0.0, -4.0), 23.0, Color(0.88, 0.72, 0.35, 0.12))
		draw_arc(screen_position + Vector2(0.0, -4.0), 23.0, 0.0, TAU, 32, Color("#f0ce77"), 2.0)
		_draw_text(str(item.get("label", kind)).to_upper(), screen_position + Vector2(22.0, -27.0), 9, Color("#f0ce77"))


func _sprite_for_kind(kind: String) -> Texture2D:
	match kind:
		"desk", "reception_desk":
			return DESK_SPRITE
		"sofa", "couch", "meditation_cushion":
			return SOFA_SPRITE
		"bookshelf":
			return BOOKSHELF_SPRITE
		"plant", "potted_plant", "temple_tree":
			return PLANT_SPRITE
		"tv", "arcade", "vending_machine", "reflection_screen", "temple_audio_control":
			return PC_SPRITE
	return null


func _draw_hud(size: Vector2) -> void:
	var floor_number := int(scene_data.get("floor", 6))
	var room_name := str(scene_data.get("room", "tower"))
	_draw_text("SALARYMAN  /  TOWER SIDE VIEW", Vector2(38.0, 46.0), 20, Color("#f3e4b1"))
	_draw_text("FLOOR %02d  ·  %s" % [floor_number, room_name.replace("_", " ").to_upper()], Vector2(40.0, 108.0), 12, Color("#315f52"))
	_draw_text(bridge_status, Vector2(40.0, size.y - 48.0), 10, Color("#315f52"))
	var showing_notice := notice_remaining > 0.0
	var message := notice if showing_notice else "A / D MOVE   W / S DEPTH   SPACE JUMP   E INTERACT"
	var message_color := Color("#f1c96f") if showing_notice else Color("#f3e4b1")
	_draw_text(message, Vector2(40.0, size.y - 27.0), 10, message_color)
	_draw_text("MOVE TO LIFT / STAIRS  ·  PGUP / PGDN CHANGE FLOORS", Vector2(size.x - 405.0, size.y - 27.0), 9, Color("#315f52"))


func _draw_text(text: String, position: Vector2, font_size: int, color: Color) -> void:
	draw_string(
		ThemeDB.fallback_font,
		position,
		text,
		HORIZONTAL_ALIGNMENT_LEFT,
		-1.0,
		font_size,
		color,
	)
