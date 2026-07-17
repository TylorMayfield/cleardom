# Design-system preset compatibility

ClearDOM 1.x validates each preset against pinned component syntax in `src/scanner.test.ts`. These ranges describe the component APIs covered by those fixtures; versions outside a range can still use explicit `components` mappings but are not covered by the preset contract.

| Preset | Validated package range | Covered examples |
| --- | --- | --- |
| `radix` | `@radix-ui/themes >=3 <4`; primitives `>=1 <2` | Button, IconButton, Toggle, Checkbox, RadioGroupItem, Switch, TabsTrigger |
| `mui` | `@mui/material >=5 <8` | Button, IconButton, TextField, FormControl, Checkbox, Radio, Switch, Link |
| `react-aria` | `react-aria-components >=1 <2` | Button, Link, TextField, Checkbox, Radio, Switch, Tab |
| `react-native` | `react-native >=0.72 <0.83`; Expo `>=49 <55` | Pressable, touchables, TextInput, Image |
| `chakra` | `@chakra-ui/react >=2 <4` | Button, IconButton, FormControl, Input, Textarea, Link |
| `ant-design` | `antd >=5 <7` | Button, Input, Checkbox, Radio, Switch, Select |
| `headless-ui` | `@headlessui/react >=1.7 <3` | Button, Switch, Checkbox, Radio, Tab |
| `mantine` | `@mantine/core >=7 <9` | Button, ActionIcon, TextInput, Checkbox, Radio, Switch |
| `react-bootstrap` | `react-bootstrap >=2 <3` | Button, Form.Control, Form.Check, Nav.Link |

The fixtures exercise import provenance, wrapper-provided labels, polymorphic element props, static child text, disabled/value props, and adversarial similarly named imports. An unvalidated lightweight-template result remains advisory unless explicitly promoted.
