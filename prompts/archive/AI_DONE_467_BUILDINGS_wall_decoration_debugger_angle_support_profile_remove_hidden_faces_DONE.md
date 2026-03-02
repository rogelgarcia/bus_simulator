# DONE

- Removed wall-facing back-face triangles from `angled_support_profile` geometry generation so hidden wall-contact faces are not emitted.
- Removed horizontal top-cap triangles on the main angled-support block when they are occluded by the angled-cap setup.
- Kept geometry placement/bounds flow intact and applied the optimization in shared geometry factory used by both Wall Decoration Debugger and BF2 rendering paths.
