# ClearDOM WCAG Coverage Documentation

This document tracks the full WCAG 2.2 success-criteria catalog and how ClearDOM maps to it. It separates WCAG coverage from ClearDOM implementation coverage: a WCAG criterion can be present in the benchmark, mapped to one or more ClearDOM rules, manual-only, or currently untracked.

## Summary

| Metric | Count |
| --- | --- |
| WCAG 2.2 total success criteria | 86 |
| WCAG 2.2 Level A + AA criteria | 55 |
| WCAG 2.2 Level AAA criteria | 31 |
| Benchmark fixture criteria | 55 |
| Criteria mapped by ClearDOM rules | 86 |
| Criteria with no ClearDOM rule | 0 |

Rule mapping is not the same as automated proof. The 88-rule catalog currently contains 14 automated rules, 27 needs-review rules, and 47 manual-guidance rules. Only high-confidence automated findings block by default; reports expose these classes separately.

## WCAG 2.2 Criteria Tracker

| Criterion | Level | Title | Benchmark Fixture | Benchmark Detectors | ClearDOM Rules | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1.1.1 | A | Non-text Content | Yes | cleardom-static, axe, pa11y | CDOM_1_1_1_IMAGE_ALT | ClearDOM mapped |
| 1.2.1 | A | Audio-only and Video-only (Prerecorded) | Yes | cleardom-static, pa11y, manual | CDOM_1_2_1_MEDIA_ALTERNATIVE | ClearDOM mapped |
| 1.2.2 | A | Captions (Prerecorded) | Yes | cleardom-static, pa11y, manual | CDOM_1_2_1_MEDIA_ALTERNATIVE | ClearDOM mapped |
| 1.2.3 | A | Audio Description or Media Alternative (Prerecorded) | Yes | cleardom-static, manual | CDOM_1_2_1_MEDIA_ALTERNATIVE | ClearDOM mapped |
| 1.2.4 | AA | Captions (Live) | Yes | cleardom-static, manual | CDOM_1_2_4_LIVE_CAPTIONS | ClearDOM mapped |
| 1.2.5 | AA | Audio Description (Prerecorded) | Yes | cleardom-static, pa11y, manual | CDOM_1_2_1_MEDIA_ALTERNATIVE | ClearDOM mapped |
| 1.2.6 | AAA | Sign Language (Prerecorded) | No | - | CDOM_1_2_6_SIGN_LANGUAGE | ClearDOM mapped |
| 1.2.7 | AAA | Extended Audio Description (Prerecorded) | No | - | CDOM_1_2_7_EXTENDED_AUDIO_DESCRIPTION | ClearDOM mapped |
| 1.2.8 | AAA | Media Alternative (Prerecorded) | No | - | CDOM_1_2_8_FULL_MEDIA_ALTERNATIVE | ClearDOM mapped |
| 1.2.9 | AAA | Audio-only (Live) | No | - | CDOM_1_2_9_LIVE_AUDIO_TRANSCRIPT | ClearDOM mapped |
| 1.3.1 | A | Info and Relationships | Yes | cleardom-static, cleardom-runtime, pa11y, manual | CDOM_1_3_1_FIELDSET_LEGEND, CDOM_1_3_1_HEADING_ORDER, CDOM_3_3_2_PLACEHOLDER_LABEL, CDOM_4_1_2_ARIA_HIDDEN_FOCUS, CDOM_4_1_2_ARIA_REFERENCE, CDOM_4_1_2_DUPLICATE_ID, CDOM_4_1_2_FORM_LABEL | ClearDOM mapped |
| 1.3.2 | A | Meaningful Sequence | Yes | cleardom-static, manual | CDOM_1_3_2_MEANINGFUL_SEQUENCE | ClearDOM mapped |
| 1.3.3 | A | Sensory Characteristics | Yes | cleardom-static, manual | CDOM_1_3_3_SENSORY_INSTRUCTIONS | ClearDOM mapped |
| 1.3.4 | AA | Orientation | Yes | cleardom-static, manual | CDOM_1_3_4_ORIENTATION | ClearDOM mapped |
| 1.3.5 | AA | Identify Input Purpose | Yes | cleardom-static, pa11y, manual | CDOM_1_3_5_AUTOCOMPLETE | ClearDOM mapped |
| 1.3.6 | AAA | Identify Purpose | No | - | CDOM_1_3_6_IDENTIFY_PURPOSE | ClearDOM mapped |
| 1.4.1 | A | Use of Color | Yes | cleardom-static, manual | CDOM_1_4_1_USE_OF_COLOR | ClearDOM mapped |
| 1.4.2 | A | Audio Control | Yes | cleardom-static, manual | CDOM_1_4_2_AUDIO_CONTROL | ClearDOM mapped |
| 1.4.3 | AA | Contrast (Minimum) | Yes | cleardom-runtime, axe, pa11y | CDOM_1_4_3_CONTRAST | ClearDOM mapped |
| 1.4.4 | AA | Resize Text | Yes | cleardom-static, manual | CDOM_1_4_4_RESIZE_TEXT | ClearDOM mapped |
| 1.4.5 | AA | Images of Text | Yes | cleardom-static, manual | CDOM_1_4_5_IMAGES_OF_TEXT | ClearDOM mapped |
| 1.4.6 | AAA | Contrast (Enhanced) | No | - | CDOM_1_4_6_ENHANCED_CONTRAST | ClearDOM mapped |
| 1.4.7 | AAA | Low or No Background Audio | No | - | CDOM_1_4_7_BACKGROUND_AUDIO | ClearDOM mapped |
| 1.4.8 | AAA | Visual Presentation | No | - | CDOM_1_4_8_VISUAL_PRESENTATION | ClearDOM mapped |
| 1.4.9 | AAA | Images of Text (No Exception) | No | - | CDOM_1_4_9_IMAGES_OF_TEXT_NO_EXCEPTION | ClearDOM mapped |
| 1.4.10 | AA | Reflow | Yes | cleardom-runtime, manual | CDOM_1_4_10_REFLOW | ClearDOM mapped |
| 1.4.11 | AA | Non-text Contrast | Yes | cleardom-static, manual | CDOM_1_4_11_NON_TEXT_CONTRAST | ClearDOM mapped |
| 1.4.12 | AA | Text Spacing | Yes | cleardom-runtime, manual | CDOM_1_4_12_TEXT_SPACING | ClearDOM mapped |
| 1.4.13 | AA | Content on Hover or Focus | Yes | cleardom-runtime, manual | CDOM_1_4_13_HOVER_FOCUS_CONTENT | ClearDOM mapped |
| 2.1.1 | A | Keyboard | Yes | cleardom-static, pa11y | CDOM_2_1_1_KEYBOARD, CDOM_2_4_3_POSITIVE_TABINDEX, CDOM_4_1_2_ANCHOR_HREF | ClearDOM mapped |
| 2.1.2 | A | No Keyboard Trap | Yes | cleardom-runtime, manual | CDOM_2_1_2_KEYBOARD_TRAP | ClearDOM mapped |
| 2.1.3 | AAA | Keyboard (No Exception) | No | - | CDOM_2_1_3_KEYBOARD_NO_EXCEPTION | ClearDOM mapped |
| 2.1.4 | A | Character Key Shortcuts | Yes | cleardom-static, manual | CDOM_2_1_4_CHARACTER_KEY_SHORTCUTS | ClearDOM mapped |
| 2.2.1 | A | Timing Adjustable | Yes | cleardom-static, manual | CDOM_2_2_1_TIMING_ADJUSTABLE | ClearDOM mapped |
| 2.2.2 | A | Pause, Stop, Hide | Yes | cleardom-static, manual | CDOM_2_2_2_PAUSE_STOP_HIDE | ClearDOM mapped |
| 2.2.3 | AAA | No Timing | No | - | CDOM_2_2_3_NO_TIMING | ClearDOM mapped |
| 2.2.4 | AAA | Interruptions | No | - | CDOM_2_2_4_INTERRUPTION_CONTROL | ClearDOM mapped |
| 2.2.5 | AAA | Re-authenticating | No | - | CDOM_2_2_5_REAUTHENTICATING_DATA | ClearDOM mapped |
| 2.2.6 | AAA | Timeouts | No | - | CDOM_2_2_6_TIMEOUT_WARNING | ClearDOM mapped |
| 2.3.1 | A | Three Flashes or Below Threshold | Yes | cleardom-static, manual | CDOM_2_3_1_FLASHING_CONTENT | ClearDOM mapped |
| 2.3.2 | AAA | Three Flashes | No | - | CDOM_2_3_2_THREE_FLASHES | ClearDOM mapped |
| 2.3.3 | AAA | Animation from Interactions | No | - | CDOM_2_3_3_ANIMATION_FROM_INTERACTIONS | ClearDOM mapped |
| 2.4.1 | A | Bypass Blocks | Yes | cleardom-runtime, manual | CDOM_2_4_1_SKIP_LINK | ClearDOM mapped |
| 2.4.2 | A | Page Titled | Yes | cleardom-static, pa11y, manual | CDOM_3_1_1_DOCUMENT_METADATA | ClearDOM mapped |
| 2.4.3 | A | Focus Order | Yes | cleardom-static, manual | CDOM_2_4_3_POSITIVE_TABINDEX | ClearDOM mapped |
| 2.4.4 | A | Link Purpose (In Context) | Yes | cleardom-static, pa11y, manual | CDOM_2_4_4_AMBIGUOUS_LABEL | ClearDOM mapped |
| 2.4.5 | AA | Multiple Ways | Yes | cleardom-static, manual | CDOM_2_4_5_MULTIPLE_WAYS | ClearDOM mapped |
| 2.4.6 | AA | Headings and Labels | Yes | cleardom-static, pa11y, manual | CDOM_1_3_1_HEADING_ORDER | ClearDOM mapped |
| 2.4.7 | AA | Focus Visible | Yes | cleardom-runtime, pa11y, manual | CDOM_2_4_7_FOCUS_VISIBLE | ClearDOM mapped |
| 2.4.8 | AAA | Location | No | - | CDOM_2_4_8_LOCATION_INDICATOR | ClearDOM mapped |
| 2.4.9 | AAA | Link Purpose (Link Only) | No | - | CDOM_2_4_4_AMBIGUOUS_LABEL | ClearDOM mapped |
| 2.4.10 | AAA | Section Headings | No | - | CDOM_2_4_10_SECTION_HEADINGS | ClearDOM mapped |
| 2.4.11 | AA | Focus Not Obscured (Minimum) | Yes | cleardom-runtime, manual | CDOM_2_4_11_FOCUS_OBSCURED | ClearDOM mapped |
| 2.4.12 | AAA | Focus Not Obscured (Enhanced) | No | - | CDOM_2_4_12_FOCUS_OBSCURED_ENHANCED | ClearDOM mapped |
| 2.4.13 | AAA | Focus Appearance | No | - | CDOM_2_4_13_FOCUS_APPEARANCE | ClearDOM mapped |
| 2.5.1 | A | Pointer Gestures | Yes | cleardom-static, manual | CDOM_2_5_1_POINTER_GESTURES | ClearDOM mapped |
| 2.5.2 | A | Pointer Cancellation | Yes | cleardom-static, manual | CDOM_2_5_2_POINTER_CANCELLATION | ClearDOM mapped |
| 2.5.3 | A | Label in Name | Yes | cleardom-static, pa11y, manual | CDOM_2_5_3_LABEL_IN_NAME, CDOM_4_1_2_NATIVE_LABEL, CDOM_4_1_2_UNNAMED_CONTROL | ClearDOM mapped |
| 2.5.4 | A | Motion Actuation | Yes | cleardom-static, manual | CDOM_2_5_4_MOTION_ACTUATION | ClearDOM mapped |
| 2.5.5 | AAA | Target Size (Enhanced) | No | - | CDOM_2_5_5_TARGET_SIZE_ENHANCED | ClearDOM mapped |
| 2.5.6 | AAA | Concurrent Input Mechanisms | No | - | CDOM_2_5_6_CONCURRENT_INPUT | ClearDOM mapped |
| 2.5.7 | AA | Dragging Movements | Yes | cleardom-static, manual | CDOM_2_5_7_DRAGGING_MOVEMENTS | ClearDOM mapped |
| 2.5.8 | AA | Target Size (Minimum) | Yes | cleardom-runtime, manual | CDOM_2_5_8_TARGET_SIZE | ClearDOM mapped |
| 3.1.1 | A | Language of Page | Yes | cleardom-static, axe, pa11y | CDOM_3_1_1_DOCUMENT_METADATA | ClearDOM mapped |
| 3.1.2 | AA | Language of Parts | Yes | cleardom-static, manual | CDOM_3_1_2_LANGUAGE_OF_PARTS | ClearDOM mapped |
| 3.1.3 | AAA | Unusual Words | No | - | CDOM_3_1_3_UNUSUAL_WORDS | ClearDOM mapped |
| 3.1.4 | AAA | Abbreviations | No | - | CDOM_3_1_4_ABBREVIATIONS | ClearDOM mapped |
| 3.1.5 | AAA | Reading Level | No | - | CDOM_3_1_5_READING_LEVEL | ClearDOM mapped |
| 3.1.6 | AAA | Pronunciation | No | - | CDOM_3_1_6_PRONUNCIATION | ClearDOM mapped |
| 3.2.1 | A | On Focus | Yes | cleardom-static, manual | CDOM_3_2_1_CONTEXT_CHANGE | ClearDOM mapped |
| 3.2.2 | A | On Input | Yes | cleardom-static, manual | CDOM_3_2_1_CONTEXT_CHANGE | ClearDOM mapped |
| 3.2.3 | AA | Consistent Navigation | Yes | cleardom-static, manual | CDOM_3_2_3_CONSISTENT_NAVIGATION | ClearDOM mapped |
| 3.2.4 | AA | Consistent Identification | Yes | cleardom-static, manual | CDOM_3_2_4_CONSISTENT_IDENTIFICATION | ClearDOM mapped |
| 3.2.5 | AAA | Change on Request | No | - | CDOM_3_2_5_CHANGE_ON_REQUEST | ClearDOM mapped |
| 3.2.6 | A | Consistent Help | Yes | cleardom-static, manual | CDOM_3_2_6_CONSISTENT_HELP | ClearDOM mapped |
| 3.3.1 | A | Error Identification | Yes | cleardom-static, manual | CDOM_3_3_1_ERROR_DESCRIPTION | ClearDOM mapped |
| 3.3.2 | A | Labels or Instructions | Yes | cleardom-static, pa11y | CDOM_1_3_1_FIELDSET_LEGEND, CDOM_3_3_2_PLACEHOLDER_LABEL, CDOM_4_1_2_FORM_LABEL | ClearDOM mapped |
| 3.3.3 | AA | Error Suggestion | Yes | cleardom-static, manual | CDOM_3_3_1_ERROR_DESCRIPTION | ClearDOM mapped |
| 3.3.4 | AA | Error Prevention (Legal, Financial, Data) | Yes | cleardom-static, manual | CDOM_3_3_4_ERROR_PREVENTION_LEGAL_FINANCIAL_DATA | ClearDOM mapped |
| 3.3.5 | AAA | Help | No | - | CDOM_3_3_5_HELP_AVAILABLE | ClearDOM mapped |
| 3.3.6 | AAA | Error Prevention (All) | No | - | CDOM_3_3_6_ERROR_PREVENTION_ALL | ClearDOM mapped |
| 3.3.7 | A | Redundant Entry | Yes | cleardom-static, manual | CDOM_3_3_7_REDUNDANT_ENTRY | ClearDOM mapped |
| 3.3.8 | AA | Accessible Authentication (Minimum) | Yes | cleardom-static, manual | CDOM_3_3_8_ACCESSIBLE_AUTHENTICATION | ClearDOM mapped |
| 3.3.9 | AAA | Accessible Authentication (Enhanced) | No | - | CDOM_3_3_9_ACCESSIBLE_AUTHENTICATION_ENHANCED | ClearDOM mapped |
| 4.1.2 | A | Name, Role, Value | Yes | cleardom-static, cleardom-runtime, axe, pa11y | CDOM_2_1_1_KEYBOARD, CDOM_3_3_1_ERROR_DESCRIPTION, CDOM_4_1_2_ANCHOR_HREF, CDOM_4_1_2_ARIA_HIDDEN_FOCUS, CDOM_4_1_2_ARIA_REFERENCE, CDOM_4_1_2_ARIA_STATE, CDOM_4_1_2_DUPLICATE_ID, CDOM_4_1_2_FORM_LABEL, CDOM_4_1_2_INVALID_ARIA_ROLE, CDOM_4_1_2_NATIVE_LABEL, CDOM_4_1_2_NATIVE_ROLE, CDOM_4_1_2_UNNAMED_CONTROL | ClearDOM mapped |
| 4.1.3 | AA | Status Messages | Yes | cleardom-static, pa11y, manual | CDOM_4_1_3_STATUS_LIVE_REGION | ClearDOM mapped |

## ClearDOM Rule Catalog

| Rule | Title | Severity | Confidence | WCAG 2.2 Criteria | Platforms |
| --- | --- | --- | --- | --- | --- |
| CDOM_4_1_2_UNNAMED_CONTROL | Interactive control has no accessible name | critical | high | 4.1.2, 2.5.3 | web |
| CDOM_4_1_2_NATIVE_LABEL | React Native touch control has no accessibility label | critical | high | 4.1.2, 2.5.3 | react-native-ios, react-native-android |
| CDOM_2_4_4_AMBIGUOUS_LABEL | Interactive label is ambiguous | warning | medium | 2.4.4, 2.4.9 | web, react-native-ios, react-native-android |
| CDOM_3_3_2_PLACEHOLDER_LABEL | Input relies on placeholder text as its label | warning | high | 3.3.2, 1.3.1 | web |
| CDOM_1_1_1_IMAGE_ALT | Image has no useful alternative text | warning | high | 1.1.1 | web |
| CDOM_4_1_2_ANCHOR_HREF | Anchor is missing an href | warning | high | 4.1.2, 2.1.1 | web |
| CDOM_2_1_1_KEYBOARD | Clickable non-interactive element lacks keyboard support | critical | medium | 2.1.1, 4.1.2 | web |
| CDOM_1_3_1_HEADING_ORDER | Heading level jumps | warning | medium | 1.3.1, 2.4.6 | web |
| CDOM_4_1_2_NATIVE_ROLE | React Native touch control has no accessibility role | warning | medium | 4.1.2 | react-native-ios, react-native-android |
| CDOM_4_1_2_FORM_LABEL | Form control has no accessible label | critical | high | 4.1.2, 1.3.1, 3.3.2 | web |
| CDOM_3_1_1_DOCUMENT_METADATA | Document language or title is missing | warning | high | 3.1.1, 2.4.2 | web |
| CDOM_1_3_5_AUTOCOMPLETE | Personal information input is missing autocomplete | warning | medium | 1.3.5 | web |
| CDOM_2_5_3_LABEL_IN_NAME | Accessible name does not include visible label | warning | medium | 2.5.3 | web |
| CDOM_4_1_3_STATUS_LIVE_REGION | Status message is not exposed as a live region | warning | medium | 4.1.3 | web |
| CDOM_1_2_1_MEDIA_ALTERNATIVE | Media is missing an obvious text alternative | warning | medium | 1.2.1, 1.2.2, 1.2.3, 1.2.5 | web |
| CDOM_4_1_2_ARIA_HIDDEN_FOCUS | Focusable content is hidden from assistive technology | critical | high | 4.1.2, 1.3.1 | web |
| CDOM_4_1_2_DUPLICATE_ID | Duplicate id values can break accessibility references | warning | high | 4.1.2, 1.3.1 | web |
| CDOM_2_4_3_POSITIVE_TABINDEX | Positive tabIndex changes the natural focus order | warning | high | 2.4.3, 2.1.1 | web |
| CDOM_1_3_1_FIELDSET_LEGEND | Grouped form controls are missing a legend | warning | high | 1.3.1, 3.3.2 | web |
| CDOM_3_3_1_ERROR_DESCRIPTION | Invalid form control is not connected to error text | warning | medium | 3.3.1, 3.3.3, 4.1.2 | web |
| CDOM_2_5_2_POINTER_CANCELLATION | Pointer action may fire before cancellation is possible | warning | medium | 2.5.2 | web |
| CDOM_1_4_1_USE_OF_COLOR | Instruction or state change may rely on color alone | warning | medium | 1.4.1 | web |
| CDOM_1_3_3_SENSORY_INSTRUCTIONS | Instruction may rely on sensory characteristics | warning | medium | 1.3.3 | web |
| CDOM_3_1_2_LANGUAGE_OF_PARTS | Foreign-language text is not marked with lang | warning | medium | 3.1.2 | web |
| CDOM_3_2_1_CONTEXT_CHANGE | Focus or input handler may change context unexpectedly | warning | medium | 3.2.1, 3.2.2 | web |
| CDOM_1_4_2_AUDIO_CONTROL | Autoplaying audio may lack a pause or stop control | warning | medium | 1.4.2 | web |
| CDOM_1_3_4_ORIENTATION | Content appears to require one device orientation | warning | low | 1.3.4 | web, react-native-ios, react-native-android |
| CDOM_1_2_4_LIVE_CAPTIONS | Live video may lack captions | warning | low | 1.2.4 | web |
| CDOM_1_2_6_SIGN_LANGUAGE | Prerecorded media may lack sign language interpretation | warning | low | 1.2.6 | web |
| CDOM_1_2_7_EXTENDED_AUDIO_DESCRIPTION | Prerecorded video may lack extended audio description | warning | low | 1.2.7 | web |
| CDOM_1_2_8_FULL_MEDIA_ALTERNATIVE | Prerecorded media may lack a full media alternative | warning | low | 1.2.8 | web |
| CDOM_1_2_9_LIVE_AUDIO_TRANSCRIPT | Live audio may lack a text alternative | warning | low | 1.2.9 | web |
| CDOM_1_3_2_MEANINGFUL_SEQUENCE | Meaningful sequence may be incorrect | warning | low | 1.3.2 | web, react-native-ios, react-native-android |
| CDOM_1_3_6_IDENTIFY_PURPOSE | Component purpose may not be programmatically identifiable | warning | low | 1.3.6 | web |
| CDOM_1_4_4_RESIZE_TEXT | Text may not resize cleanly | warning | low | 1.4.4 | web |
| CDOM_1_4_5_IMAGES_OF_TEXT | Image-like text may not be real text | warning | low | 1.4.5 | web |
| CDOM_1_4_6_ENHANCED_CONTRAST | Text may not meet enhanced contrast | warning | low | 1.4.6 | web |
| CDOM_1_4_11_NON_TEXT_CONTRAST | Non-text UI contrast may be too low | warning | low | 1.4.11 | web |
| CDOM_1_4_7_BACKGROUND_AUDIO | Background audio may interfere with speech | warning | low | 1.4.7 | web |
| CDOM_1_4_8_VISUAL_PRESENTATION | Text presentation may not be adaptable | warning | low | 1.4.8 | web |
| CDOM_1_4_9_IMAGES_OF_TEXT_NO_EXCEPTION | Image text may not have an AAA exception | warning | low | 1.4.9 | web |
| CDOM_2_1_4_CHARACTER_KEY_SHORTCUTS | Single-character keyboard shortcut may not be adjustable | warning | medium | 2.1.4 | web |
| CDOM_2_1_3_KEYBOARD_NO_EXCEPTION | Functionality may not be keyboard operable without exception | warning | low | 2.1.3 | web |
| CDOM_2_2_1_TIMING_ADJUSTABLE | Time limit may not be adjustable | warning | low | 2.2.1 | web |
| CDOM_2_2_2_PAUSE_STOP_HIDE | Moving or auto-updating content may lack pause controls | warning | medium | 2.2.2 | web |
| CDOM_2_2_3_NO_TIMING | Task may depend on timing | warning | low | 2.2.3 | web |
| CDOM_2_2_4_INTERRUPTION_CONTROL | Interruptions may not be postponable | warning | low | 2.2.4 | web |
| CDOM_2_2_5_REAUTHENTICATING_DATA | Re-authentication may lose user data | warning | low | 2.2.5 | web |
| CDOM_2_2_6_TIMEOUT_WARNING | Timeout may not warn about data loss | warning | low | 2.2.6 | web |
| CDOM_2_3_1_FLASHING_CONTENT | Flashing content may exceed seizure thresholds | critical | low | 2.3.1 | web |
| CDOM_2_3_2_THREE_FLASHES | Flashing content may violate AAA no-flash guidance | critical | low | 2.3.2 | web |
| CDOM_2_3_3_ANIMATION_FROM_INTERACTIONS | Interaction-triggered animation may lack reduction controls | warning | low | 2.3.3 | web |
| CDOM_2_4_5_MULTIPLE_WAYS | Content may only be reachable one way | warning | low | 2.4.5 | web |
| CDOM_2_4_8_LOCATION_INDICATOR | Current location may not be indicated | warning | low | 2.4.8 | web |
| CDOM_2_4_10_SECTION_HEADINGS | Long content may need section headings | warning | low | 2.4.10 | web |
| CDOM_2_5_1_POINTER_GESTURES | Path or multipoint gesture may lack a simple pointer alternative | warning | low | 2.5.1 | web |
| CDOM_2_5_4_MOTION_ACTUATION | Device motion may be required without an alternative | warning | low | 2.5.4 | web, react-native-ios, react-native-android |
| CDOM_2_5_7_DRAGGING_MOVEMENTS | Dragging movement may lack a non-drag alternative | warning | medium | 2.5.7 | web |
| CDOM_2_4_12_FOCUS_OBSCURED_ENHANCED | Focused control may be partially obscured | warning | low | 2.4.12 | web |
| CDOM_2_4_13_FOCUS_APPEARANCE | Focus indicator may not meet appearance requirements | warning | low | 2.4.13 | web |
| CDOM_2_5_5_TARGET_SIZE_ENHANCED | Interactive target may be smaller than enhanced target size | warning | low | 2.5.5 | web |
| CDOM_2_5_6_CONCURRENT_INPUT | Input may restrict available modalities | warning | low | 2.5.6 | web, react-native-ios, react-native-android |
| CDOM_3_2_3_CONSISTENT_NAVIGATION | Navigation order may be inconsistent | warning | low | 3.2.3 | web |
| CDOM_3_2_4_CONSISTENT_IDENTIFICATION | Repeated components may not be identified consistently | warning | low | 3.2.4 | web, react-native-ios, react-native-android |
| CDOM_3_2_6_CONSISTENT_HELP | Help location may be inconsistent | warning | low | 3.2.6 | web |
| CDOM_3_1_3_UNUSUAL_WORDS | Unusual words or jargon may be unexplained | warning | low | 3.1.3 | web, react-native-ios, react-native-android |
| CDOM_3_1_4_ABBREVIATIONS | Abbreviations may be unexplained | warning | low | 3.1.4 | web, react-native-ios, react-native-android |
| CDOM_3_1_5_READING_LEVEL | Text may exceed lower secondary reading level | warning | low | 3.1.5 | web, react-native-ios, react-native-android |
| CDOM_3_1_6_PRONUNCIATION | Pronunciation-dependent words may be unexplained | warning | low | 3.1.6 | web, react-native-ios, react-native-android |
| CDOM_3_2_5_CHANGE_ON_REQUEST | Context change may occur without explicit request | warning | low | 3.2.5 | web |
| CDOM_3_3_4_ERROR_PREVENTION_LEGAL_FINANCIAL_DATA | High-impact submission may lack review or reversal | warning | low | 3.3.4 | web |
| CDOM_3_3_5_HELP_AVAILABLE | Form help may be unavailable | warning | low | 3.3.5 | web |
| CDOM_3_3_6_ERROR_PREVENTION_ALL | Submission may lack general error prevention | warning | low | 3.3.6 | web |
| CDOM_3_3_7_REDUNDANT_ENTRY | Previously entered information may be requested again | warning | low | 3.3.7 | web |
| CDOM_3_3_8_ACCESSIBLE_AUTHENTICATION | Authentication may require a cognitive function test | warning | low | 3.3.8 | web |
| CDOM_3_3_9_ACCESSIBLE_AUTHENTICATION_ENHANCED | Authentication may require object recognition or personal content | warning | low | 3.3.9 | web |
| CDOM_1_4_3_CONTRAST | Text contrast is below the minimum ratio | critical | medium | 1.4.3 | web |
| CDOM_2_4_7_FOCUS_VISIBLE | Focused control has no visible focus indicator | critical | medium | 2.4.7 | web |
| CDOM_2_5_8_TARGET_SIZE | Interactive target is smaller than WCAG minimum | warning | medium | 2.5.8 | web |
| CDOM_1_4_10_REFLOW | Page causes horizontal overflow at narrow viewport | warning | medium | 1.4.10 | web |
| CDOM_2_4_1_SKIP_LINK | Skip link is missing or not visible on focus | warning | medium | 2.4.1 | web |
| CDOM_1_4_12_TEXT_SPACING | Text spacing causes content loss or overlap | warning | medium | 1.4.12 | web |
| CDOM_1_4_13_HOVER_FOCUS_CONTENT | Hover or focus content is not dismissible or hoverable | warning | medium | 1.4.13 | web |
| CDOM_2_1_2_KEYBOARD_TRAP | Keyboard focus appears trapped | critical | medium | 2.1.2 | web |
| CDOM_2_4_11_FOCUS_OBSCURED | Focused control is fully obscured by author content | critical | medium | 2.4.11 | web |
| CDOM_4_1_2_INVALID_ARIA_ROLE | Rendered element uses an unsupported ARIA role | critical | high | 4.1.2 | web |
| CDOM_4_1_2_ARIA_REFERENCE | Rendered ARIA relationship references a missing element | critical | high | 4.1.2, 1.3.1 | web |
| CDOM_4_1_2_ARIA_STATE | Rendered ARIA widget has a missing or invalid state | critical | high | 4.1.2 | web |

## Unmapped WCAG 2.2 Criteria

| Criterion | Level | Title | Current Tracking |
| --- | --- | --- | --- |
| - | - | - | - |

## Notes

- Mapping means ClearDOM has at least one static or runtime rule associated with the criterion. It does not mean the criterion is fully proven for every possible implementation.
- The benchmark fixture intentionally tracks WCAG 2.2 Level A and AA criteria. AAA criteria remain documented in this file so missing coverage is visible.
- Manual-only benchmark detectors identify criteria that require human judgment, richer runtime instrumentation, or product context beyond a single automated signal.
