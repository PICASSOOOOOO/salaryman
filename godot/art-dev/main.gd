extends Node2D

## Godot 4 art-development preview for SALARYMAN's shared pixel character
## contract. This is intentionally renderer-side: the web app remains the
## gameplay runtime, while Godot provides a higher-fidelity animation review
## loop and publishes PNG frames to the API bridge.

const FRAME_WIDTH := 16
const FRAME_HEIGHT := 32
const FRAMES_PER_ROW := 7
const FLOOR_TILE_SIZE := 16
const DIRECTIONS := ["down", "up", "right"]
const WALK_SEQUENCE := [0, 1, 2, 1]
const TYPE_SEQUENCE := [3, 4]
const READ_SEQUENCE := [5, 6]

var asset_base := "http://127.0.0.1:21129/"
var bridge_url := "ws://127.0.0.1:8080/ws/godot/render?role=publisher"
var palette_index := 0
var direction_index := 0
var animation_name := "walk"
var animation_sequence: Array[int] = WALK_SEQUENCE
var sequence_cursor := 0
var frame_elapsed := 0.0
var publish_elapsed := 0.0
var frame_duration := 0.15
var paused := false
var sprite_scale := 12
var sheet_texture: Texture2D
var floor_texture: Texture2D
var wall_texture: Texture2D
var object_texture: Texture2D
var sheet_status := "loading character sheet…"
var spatial_status := "loading floor, wall, and object references…"
var bridge_status := "connecting to render bridge…"
var last_frame_sent := 0
var request: HTTPRequest
var floor_request: HTTPRequest
var wall_request: HTTPRequest
var object_request: HTTPRequest
var bridge := WebSocketPeer.new()

func _ready() -> void:
	_read_options()
	asset_base = asset_base.trim_suffix("/") + "/"
	request = HTTPRequest.new()
	add_child(request)
	request.request_completed.connect(_on_sheet_loaded)
	_load_character_sheet()
	_load_spatial_assets()
	_connect_bridge()
	queue_redraw()

func _read_options() -> void:
	for arg in OS.get_cmdline_args():
		if arg.begins_with("--asset-base="):
			asset_base = arg.trim_prefix("--asset-base=")
		elif arg.begins_with("--bridge-url="):
			bridge_url = arg.trim_prefix("--bridge-url=")
	var env_asset_base := OS.get_environment("SALARYMAN_ASSET_BASE")
	var env_bridge_url := OS.get_environment("GODOT_RENDER_URL")
	if not env_asset_base.is_empty():
		asset_base = env_asset_base
	if not env_bridge_url.is_empty():
		bridge_url = env_bridge_url
	var token := OS.get_environment("GODOT_RENDER_TOKEN")
	if not token.is_empty() and not bridge_url.contains("token="):
		bridge_url += "&token=" + token.uri_encode()

func _load_character_sheet() -> void:
	var url := "%spixel-agents/assets/characters/char_%d.png" % [asset_base, palette_index]
	sheet_status = "loading %s…" % url
	var error := request.request(url)
	if error != OK:
		sheet_status = "asset request failed (%s)" % error_string(error)
		queue_redraw()

func _on_sheet_loaded(
	result: int,
	response_code: int,
	_headers: PackedStringArray,
	body: PackedByteArray,
) -> void:
	if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300:
		sheet_status = "asset request failed (%s / %s)" % [result, response_code]
		queue_redraw()
		return
	var image := Image.new()
	var error := image.load_png_from_buffer(body)
	if error != OK:
		sheet_status = "PNG decode failed (%s)" % error_string(error)
		queue_redraw()
		return
	if image.get_width() < FRAME_WIDTH * FRAMES_PER_ROW or image.get_height() < FRAME_HEIGHT * DIRECTIONS.size():
		sheet_status = "sprite sheet is smaller than 7×3 frames"
		queue_redraw()
		return
	sheet_texture = ImageTexture.create_from_image(image)
	sheet_status = "char_%d.png · %dx%d · 7 frames × 3 directions" % [
		palette_index,
		image.get_width(),
		image.get_height(),
	]
	queue_redraw()

func _load_spatial_assets() -> void:
	floor_request = HTTPRequest.new()
	wall_request = HTTPRequest.new()
	object_request = HTTPRequest.new()
	add_child(floor_request)
	add_child(wall_request)
	add_child(object_request)
	floor_request.request_completed.connect(_on_floor_loaded)
	wall_request.request_completed.connect(_on_wall_loaded)
	object_request.request_completed.connect(_on_object_loaded)
	floor_request.request("%spixel-agents/assets/floors/floor_0.png" % asset_base)
	wall_request.request("%spixel-agents/assets/walls/wall_0.png" % asset_base)
	object_request.request("%spixel-agents/assets/furniture/BIN/BIN.png" % asset_base)

func _decode_png(body: PackedByteArray) -> Texture2D:
	var image := Image.new()
	if image.load_png_from_buffer(body) != OK:
		return null
	return ImageTexture.create_from_image(image)

func _on_floor_loaded(
	result: int,
	response_code: int,
	_headers: PackedStringArray,
	body: PackedByteArray,
) -> void:
	if result == HTTPRequest.RESULT_SUCCESS and response_code >= 200 and response_code < 300:
		floor_texture = _decode_png(body)
	_update_spatial_status()

func _on_wall_loaded(
	result: int,
	response_code: int,
	_headers: PackedStringArray,
	body: PackedByteArray,
) -> void:
	if result == HTTPRequest.RESULT_SUCCESS and response_code >= 200 and response_code < 300:
		wall_texture = _decode_png(body)
	_update_spatial_status()

func _on_object_loaded(
	result: int,
	response_code: int,
	_headers: PackedStringArray,
	body: PackedByteArray,
) -> void:
	if result == HTTPRequest.RESULT_SUCCESS and response_code >= 200 and response_code < 300:
		object_texture = _decode_png(body)
	_update_spatial_status()

func _update_spatial_status() -> void:
	var loaded := int(floor_texture != null) + int(wall_texture != null) + int(object_texture != null)
	spatial_status = "spatial references %d/3 loaded · floor_0 / wall_0 / furniture BIN" % loaded
	queue_redraw()

func _connect_bridge() -> void:
	var error := bridge.connect_to_url(bridge_url)
	if error != OK:
		bridge_status = "bridge connection failed (%s)" % error_string(error)
	else:
		bridge_status = "bridge connecting…"

func _process(delta: float) -> void:
	bridge.poll()
	match bridge.get_ready_state():
		WebSocketPeer.STATE_OPEN:
			bridge_status = "bridge live · %d PNG frames sent" % last_frame_sent
		WebSocketPeer.STATE_CONNECTING:
			bridge_status = "bridge connecting…"
		WebSocketPeer.STATE_CLOSING:
			bridge_status = "bridge closing…"
		WebSocketPeer.STATE_CLOSED:
			if bridge_status != "bridge connection failed":
				bridge_status = "bridge offline · run API server or check URL"

	if not paused:
		frame_elapsed += delta
		if frame_elapsed >= frame_duration:
			frame_elapsed = fmod(frame_elapsed, frame_duration)
			sequence_cursor = (sequence_cursor + 1) % animation_sequence.size()
		publish_elapsed += delta
		if publish_elapsed >= 0.12 and bridge.get_ready_state() == WebSocketPeer.STATE_OPEN:
			publish_elapsed = 0.0
			call_deferred("_publish_viewport_frame")
	queue_redraw()

func _publish_viewport_frame() -> void:
	if bridge.get_ready_state() != WebSocketPeer.STATE_OPEN:
		return
	var image := get_viewport().get_texture().get_image()
	if image == null:
		return
	var packet := image.save_png_to_buffer()
	if packet.is_empty():
		return
	bridge.put_packet(packet)
	last_frame_sent += 1

func _set_animation(next_name: String) -> void:
	animation_name = next_name
	sequence_cursor = 0
	frame_elapsed = 0.0
	match next_name:
		"walk":
			animation_sequence = WALK_SEQUENCE
			frame_duration = 0.15
		"type":
			animation_sequence = TYPE_SEQUENCE
			frame_duration = 0.3
		"read":
			animation_sequence = READ_SEQUENCE
			frame_duration = 0.3

func _current_frame() -> int:
	return animation_sequence[sequence_cursor]

func _input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo:
		return
	match event.keycode:
		KEY_1:
			_set_animation("walk")
		KEY_2:
			_set_animation("type")
		KEY_3:
			_set_animation("read")
		KEY_LEFT:
			direction_index = posmod(direction_index - 1, DIRECTIONS.size())
		KEY_RIGHT:
			direction_index = posmod(direction_index + 1, DIRECTIONS.size())
		KEY_UP:
			palette_index = posmod(palette_index + 1, 6)
			_load_character_sheet()
		KEY_DOWN:
			palette_index = posmod(palette_index - 1, 6)
			_load_character_sheet()
		KEY_SPACE:
			paused = not paused
		KEY_EQUAL, KEY_KP_ADD:
			sprite_scale = mini(sprite_scale + 1, 24)
		KEY_MINUS, KEY_KP_SUBTRACT:
			sprite_scale = maxi(sprite_scale - 1, 4)
		KEY_R:
			_load_character_sheet()
			bridge.close()
			bridge = WebSocketPeer.new()
			_connect_bridge()

func _text(text: String, position: Vector2, size: int, color: Color = Color.WHITE) -> void:
	draw_string(ThemeDB.fallback_font, position, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)

func _draw() -> void:
	draw_rect(Rect2(0, 0, 960, 620), Color("#06070b"))
	draw_rect(Rect2(24, 24, 912, 572), Color("#0e1118"), true)
	draw_rect(Rect2(24, 24, 912, 572), Color("#243044"), false, 1.0)
	draw_rect(Rect2(48, 82, 864, 360), Color("#080b12"), true)
	draw_rect(Rect2(48, 82, 864, 360), Color("#243044"), false, 1.0)

	_text("SALARYMAN / GODOT ART DEV", Vector2(48, 58), 20, Color("#f472b6"))
	_text("shared sprite contract · animation review · live PNG bridge", Vector2(405, 58), 12, Color("#7d8aa3"))

	var preview_rect := Rect2(92, 112, 420, 300)
	draw_rect(preview_rect, Color("#111827"), true)
	draw_rect(preview_rect, Color("#31415e"), false, 1.0)
	draw_line(Vector2(302, 112), Vector2(302, 412), Color("#1e293b"), 1.0)
	draw_line(Vector2(92, 262), Vector2(512, 262), Color("#1e293b"), 1.0)
	_text("LIVE FRAME", Vector2(108, 138), 11, Color("#22d3ee"))

	if sheet_texture:
		var frame := _current_frame()
		var source := Rect2(frame * FRAME_WIDTH, direction_index * FRAME_HEIGHT, FRAME_WIDTH, FRAME_HEIGHT)
		var dest := Rect2(212, 184, FRAME_WIDTH * sprite_scale, FRAME_HEIGHT * sprite_scale)
		draw_texture_rect_region(sheet_texture, dest, source)
		_text("%s · %s · frame %d" % [animation_name, DIRECTIONS[direction_index], frame], Vector2(108, 392), 12, Color("#d7deeb"))
	else:
		_text("waiting for sprite sheet", Vector2(190, 266), 13, Color("#7d8aa3"))

	_text("FRAME STRIP", Vector2(548, 138), 11, Color("#22d3ee"))
	if sheet_texture:
		for i in range(FRAMES_PER_ROW):
			var thumb_source := Rect2(i * FRAME_WIDTH, direction_index * FRAME_HEIGHT, FRAME_WIDTH, FRAME_HEIGHT)
			var thumb_dest := Rect2(548 + i * 48, 166, 40, 80)
			draw_texture_rect_region(sheet_texture, thumb_dest, thumb_source)
			_text(str(i), Vector2(562 + i * 48, 266), 10, Color("#7d8aa3"))

	_text("1 walk   2 type   3 read   ←/→ direction   ↑/↓ palette", Vector2(548, 318), 11, Color("#a6b2c8"))
	_text("space pause   +/- scale   R reload", Vector2(548, 340), 11, Color("#a6b2c8"))
	_text("ASSET", Vector2(548, 380), 10, Color("#f472b6"))
	_text(sheet_status, Vector2(548, 398), 11, Color("#d7deeb"))
	_text("BRIDGE", Vector2(548, 426), 10, Color("#f472b6"))
	_text(bridge_status, Vector2(548, 444), 11, Color("#d7deeb"))

	draw_rect(Rect2(48, 470, 864, 92), Color("#0b1019"), true)
	draw_rect(Rect2(48, 470, 864, 92), Color("#243044"), false, 1.0)
	_text("SPATIAL KIT", Vector2(68, 494), 10, Color("#22d3ee"))
	if floor_texture:
		draw_texture_rect(floor_texture, Rect2(68, 506, 42, 42), false)
	if wall_texture:
		draw_texture_rect_region(wall_texture, Rect2(124, 506, 24, 48), Rect2(0, 0, 16, 32))
	if object_texture:
		draw_texture_rect(object_texture, Rect2(164, 506, 42, 42), false)
	_text(spatial_status, Vector2(230, 500), 11, Color("#d7deeb"))
	_text("Godot reviews sprites, tiles, walls, and objects. Unreal handles production spatial/cinematic output.", Vector2(230, 520), 11, Color("#a6b2c8"))
	_text("Frames publish as PNG to /ws/godot/render for Art Factory review.", Vector2(230, 540), 11, Color("#a6b2c8"))