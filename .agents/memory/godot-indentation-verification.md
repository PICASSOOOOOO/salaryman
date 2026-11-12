---
name: Godot indentation verification
description: Preserve GDScript block indentation when patching and validate with the installed headless Godot runtime.
---

Every GDScript body and nested block must retain literal tab indentation in patches. A syntactically plausible diff can still leave a function body at column zero and prevent the whole client from loading.

**Why:** a freight-cart/elevator change reached the headless game with unindented GDScript statements, which the parser rejected before tests could run.

**How to apply:** include tabs on every inserted statement at its block depth, then run `godot4 --headless --path godot/office-client --quit-after 2` and the focused Godot test script before considering the change verified.
