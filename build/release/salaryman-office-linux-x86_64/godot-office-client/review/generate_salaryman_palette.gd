extends SceneTree
## Recolors the existing Godot character atlas for the isolated salaryman preview.

const SOURCE := "res://agentshire-assets/characters/Textures/colormap.png"
const OUTPUT := "res://review/colormap-salaryman-tour-review.png"

const SUIT := [
	Color("#192431"),
	Color("#253447"),
	Color("#33475d"),
	Color("#465a70"),
	Color("#617286"),
]
const TROUSER := [
	Color("#151d27"),
	Color("#202c3a"),
	Color("#2c3b4b"),
	Color("#3a4a5c"),
	Color("#536477"),
]
const BURGUNDY := [
	Color("#32191d"),
	Color("#542126"),
	Color("#742a31"),
	Color("#983a40"),
	Color("#b45758"),
]
const SKIN := [
	Color("#704b39"),
	Color("#956548"),
	Color("#b98261"),
	Color("#d09a77"),
	Color("#e1b28f"),
]
const CREAM := [
	Color("#8d806b"),
	Color("#b2a58a"),
	Color("#d4c8ad"),
	Color("#eee2c8"),
	Color("#f5ead4"),
]
const HAIR := [
	Color("#34373b"),
	Color("#50545a"),
	Color("#70747a"),
	Color("#929591"),
	Color("#b4b1a8"),
]
const LEATHER := [
	Color("#30231b"),
	Color("#493426"),
	Color("#654a34"),
	Color("#806248"),
	Color("#9a7955"),
]


func _initialize() -> void:
	call_deferred("_generate")


func _generate() -> void:
	var image := Image.load_from_file(ProjectSettings.globalize_path(SOURCE))
	if image.is_empty():
		push_error("Could not load source character palette: " + SOURCE)
		quit(1)
		return

	for y in range(image.get_height()):
		for x in range(image.get_width()):
			var palette: Array = _palette_for_pixel(x, y)
			if palette.is_empty():
				continue
			var source_color := image.get_pixel(x, y)
			if source_color.a < 0.05:
				continue
			var brightness := (source_color.r + source_color.g + source_color.b) / 3.0
			var shade := clampi(roundi(brightness * float(palette.size() - 1)), 0, palette.size() - 1)
			if x < 128 and y >= 320 and y < 448 and (x + y * 3) % 17 == 0:
				shade = mini(shade + 1, palette.size() - 1)
			var result: Color = palette[shade]
			result.a = source_color.a
			image.set_pixel(x, y, result)

	var output_path := ProjectSettings.globalize_path(OUTPUT)
	var error := image.save_png(output_path)
	print("Salaryman palette generated: %s (error %d)" % [output_path, error])
	quit(0 if error == OK else 1)


func _palette_for_pixel(x: int, y: int) -> Array:
	# The source atlas' seven garment swatches occupy the complete y=256..384
	# band. Recolor both halves; leaving the lower half untouched exposes the
	# original bright green/orange palette through the clothes.
	if y >= 256 and y < 384:
		if x >= 64 and x < 128:
			return SUIT
		if x >= 128 and x < 192:
			return TROUSER
		if x >= 192 and x < 256:
			return SKIN
		if x >= 256 and x < 320:
			return BURGUNDY
		if x >= 320 and x < 384:
			return SUIT
		if x >= 384 and x < 448:
			return CREAM
		if x >= 448:
			return LEATHER
	if y >= 384 and y < 512:
		if x < 128:
			return HAIR
		if x >= 128 and x < 192:
			return CREAM
		if x >= 192 and x < 320:
			return SKIN
	return []
