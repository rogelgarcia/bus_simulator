# The wear features. A feature is one module in features/; plugging one in is one import and one entry in MODULES
# (see the README's "The wear layer" for what a module holds). features() gives them in SHADER CHAIN order (ORDER,
# lowest first: the order their looks are laid on the material, and the debug legend's). build_order() gives them in
# BUILD order: a feature is built after every feature named in its NEEDS, whose published fields it reads.
import re
from .features import probe, runoff, soiling, washed, street_grime, rust, efflorescence, edge_wear, glass_grime, pigeon
from .features import mortar_erosion

MODULES = [probe, runoff, soiling, washed, street_grime, rust, efflorescence, edge_wear, glass_grime, pigeon,
           mortar_erosion]

REQUIRED = ("NAME", "AI", "LABEL", "ORDER", "DEFAULT_STRENGTH", "DEBUG_COLOR", "build", "shader")
_IDENT = re.compile(r"[a-z][a-z0-9_]*")


def features():
    names = set()
    for m in MODULES:
        missing = [a for a in REQUIRED if not hasattr(m, a)]
        assert not missing, f"wear feature {m.__name__} lacks {missing}"
        assert _IDENT.fullmatch(m.NAME), f"wear feature name {m.NAME!r}: lowercase identifier"
        assert m.NAME not in names, f"two wear features called {m.NAME}"
        assert len(m.DEBUG_COLOR) == 3, f"{m.NAME}: DEBUG_COLOR is (r, g, b)"
        names.add(m.NAME)
    for m in MODULES:   # a feature's extra controls are scene properties wear_<feature>_<control>: keep them unique
        for c in getattr(m, "CONTROLS", {}):
            assert _IDENT.fullmatch(c), f"{m.NAME}: control name {c!r}: lowercase identifier"
            assert f"{m.NAME}_{c}" not in names, f"{m.NAME}: control {c} collides with the feature {m.NAME}_{c}"
        for n in getattr(m, "NEEDS", ()):
            assert n in names, f"{m.NAME} NEEDS {n}, which is not a registered feature"
    return sorted(MODULES, key=lambda m: (m.ORDER, m.NAME))


def build_order():
    todo = {m.NAME: m for m in features()}
    done, out = set(), []
    while todo:
        ready = sorted((m for m in todo.values() if set(getattr(m, "NEEDS", ())) <= done), key=lambda m: (m.ORDER, m.NAME))
        assert ready, f"wear features NEED each other in a cycle: {sorted(todo)}"
        for m in ready:
            out.append(m); done.add(m.NAME); del todo[m.NAME]
    return out
