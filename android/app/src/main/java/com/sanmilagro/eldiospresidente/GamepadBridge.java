package com.sanmilagro.eldiospresidente;

import android.content.Context;
import android.hardware.input.InputManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Raw controller pipe from Android to the game.
 *
 * Android TV WebViews list a connected gamepad through the W3C Gamepad API but often never
 * deliver its events, so MainActivity feeds every controller KeyEvent and MotionEvent in here
 * instead. This class does not decide what anything means: it reports which Android key codes
 * are held and the value of every joystick axis, plus a description of the controller(s). The
 * game (web/src/input.js) maps those to buttons and sticks, because different Android builds lay
 * the DualShock 4 out differently (Sony key layout files, Generic.kl, old and new kernel drivers).
 *
 * Sticks are accepted from any joystick-class event, whichever input node sends them: some
 * Android builds split one physical controller into several devices.
 *
 * The game polls {@code window.AndroidPad.state()} once per frame and calls
 * {@code window.AndroidPad.device()} when the description changes.
 */
public class GamepadBridge implements InputManager.InputDeviceListener {
    private static final int MAX_KEY = 512;
    private static final int MAX_AXIS = 48;
    /** Axes always reported, even if a controller does not list its motion ranges. */
    private static final int[] COMMON_AXES = {
            MotionEvent.AXIS_X, MotionEvent.AXIS_Y, MotionEvent.AXIS_Z, MotionEvent.AXIS_RX, MotionEvent.AXIS_RY,
            MotionEvent.AXIS_RZ, MotionEvent.AXIS_HAT_X, MotionEvent.AXIS_HAT_Y, MotionEvent.AXIS_LTRIGGER,
            MotionEvent.AXIS_RTRIGGER, MotionEvent.AXIS_GAS, MotionEvent.AXIS_BRAKE};
    /** Key codes whose presence on the controller tells the game which layout Android applied. */
    private static final int[] PROBE_KEYS = {
            KeyEvent.KEYCODE_BUTTON_A, KeyEvent.KEYCODE_BUTTON_B, KeyEvent.KEYCODE_BUTTON_C, KeyEvent.KEYCODE_BUTTON_X,
            KeyEvent.KEYCODE_BUTTON_Y, KeyEvent.KEYCODE_BUTTON_Z, KeyEvent.KEYCODE_BUTTON_L1, KeyEvent.KEYCODE_BUTTON_R1,
            KeyEvent.KEYCODE_BUTTON_L2, KeyEvent.KEYCODE_BUTTON_R2, KeyEvent.KEYCODE_BUTTON_THUMBL,
            KeyEvent.KEYCODE_BUTTON_THUMBR, KeyEvent.KEYCODE_BUTTON_START, KeyEvent.KEYCODE_BUTTON_SELECT,
            KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.KEYCODE_BUTTON_1, KeyEvent.KEYCODE_BUTTON_2,
            KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN, KeyEvent.KEYCODE_DPAD_LEFT,
            KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_MENU};

    private final InputManager inputManager;
    private final boolean[] down = new boolean[MAX_KEY];
    private final float[] axes = new float[MAX_AXIS];
    private final boolean[] reported = new boolean[MAX_AXIS];
    private final Set<Integer> knownPads = new HashSet<>();
    private int primaryId = -1;
    private int deviceVersion;
    private String deviceJson = "{}";
    private long keyEvents, stickEvents, pointerEvents, otherEvents;
    private int lastKey = -1;
    private String lastKeyName = "";
    /** One line describing the most recent motion event of each kind, for the diagnostics panel. */
    private String lastStick = "", lastPointer = "";

    GamepadBridge(Context context) {
        inputManager = (InputManager) context.getSystemService(Context.INPUT_SERVICE);
        inputManager.registerInputDeviceListener(this, new Handler(Looper.getMainLooper()));
        rescan();
    }

    void release() { inputManager.unregisterInputDeviceListener(this); }

    /**
     * Forget held buttons and stick positions. Called when the app loses focus: a button released
     * while another window had focus (e.g. the PS button opening the system overlay) never sends
     * its key-up here, and would otherwise stay "held" forever.
     */
    synchronized void clearHeld() {
        Arrays.fill(down, false);
        Arrays.fill(axes, 0f);
    }

    /** Any device with gamepad buttons or joystick axes, including ones Android marks virtual. */
    private static boolean isPad(InputDevice dev) {
        if (dev == null) return false;
        int s = dev.getSources();
        return (s & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                || (s & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
    }

    private static boolean hasButtons(InputDevice dev) {
        return dev != null && (dev.getSources() & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD;
    }

    /** Preference for naming the controller: real with buttons, then any with buttons, then the rest. */
    private static int rank(InputDevice d) { return (hasButtons(d) ? 2 : 0) + (d.isVirtual() ? 0 : 1); }

    private static String describe(MotionEvent e) {
        InputDevice d = e.getDevice();
        return "0x" + Integer.toHexString(e.getSource()) + " " + MotionEvent.actionToString(e.getActionMasked())
                + " from " + (d != null ? d.getName() : "device " + e.getDeviceId());
    }

    /** Returns true if the event came from a controller and was consumed. */
    synchronized boolean onKey(KeyEvent event) {
        int source = event.getSource();
        InputDevice dev = event.getDevice();
        boolean fromPad = (source & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                || (source & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK
                || isPad(dev);
        if (!fromPad) return false;
        int code = event.getKeyCode();
        switch (code) {
            case KeyEvent.KEYCODE_VOLUME_UP:
            case KeyEvent.KEYCODE_VOLUME_DOWN:
            case KeyEvent.KEYCODE_VOLUME_MUTE:
            case KeyEvent.KEYCODE_HOME:
            case KeyEvent.KEYCODE_POWER:
                return false; // never steal system keys
            default:
                break;
        }
        if (code > 0 && code < MAX_KEY) {
            int action = event.getAction();
            if (action == KeyEvent.ACTION_DOWN) {
                if (!down[code]) {
                    lastKey = code;
                    lastKeyName = KeyEvent.keyCodeToString(code).replace("KEYCODE_", "");
                }
                down[code] = true;
            } else if (action == KeyEvent.ACTION_UP) {
                down[code] = false;
            }
        }
        keyEvents++;
        if (isPad(dev) && !knownPads.contains(dev.getId())) rescan();
        // Consumed even if unmapped, so Android cannot turn Circle into BACK or the D-pad into focus moves.
        return true;
    }

    /** Returns true if the event was a stick, trigger or hat movement and was consumed. */
    synchronized boolean onMotion(MotionEvent event) {
        int source = event.getSource();
        boolean joystick = (source & InputDevice.SOURCE_CLASS_JOYSTICK) != 0;
        boolean pointer = (source & (InputDevice.SOURCE_CLASS_POINTER | InputDevice.SOURCE_CLASS_POSITION)) != 0;
        // Sticks normally arrive as joystick-class events; also accept any non-pointer motion from
        // a controller, in case a TV build labels them differently.
        if (!joystick && (pointer || !isPad(event.getDevice()))) {
            // Not a stick. Count it for the diagnostics panel (a TV "mouse mode" shows up here)
            // and leave it for the page.
            if (pointer) { pointerEvents++; lastPointer = describe(event); } else { otherEvents++; }
            return false;
        }
        stickEvents++;
        lastStick = describe(event);
        InputDevice dev = event.getDevice();
        if (isPad(dev) && !knownPads.contains(dev.getId())) rescan();
        for (int a = 0; a < MAX_AXIS; a++) {
            if (reported[a]) axes[a] = event.getAxisValue(a);
        }
        return true;
    }

    private static String axisName(int axis) {
        return MotionEvent.axisToString(axis).replace("AXIS_", "");
    }

    private static double finite(float v) { return Float.isNaN(v) || Float.isInfinite(v) ? 0 : v; }

    /**
     * Rebuild the controller description from every connected controller: the primary one (with
     * buttons) names it, and the axes and keys of all of them are merged, so a controller that
     * Android splits into several input devices still works.
     */
    private synchronized void rescan() {
        knownPads.clear();
        Arrays.fill(reported, false);
        for (int a : COMMON_AXES) reported[a] = true;
        InputDevice primary = null;
        JSONObject o = new JSONObject();
        JSONArray ranges = new JSONArray();
        JSONArray devices = new JSONArray();
        Set<Integer> rangeAxes = new HashSet<>();
        Set<Integer> keys = new HashSet<>();
        try {
            for (int id : inputManager.getInputDeviceIds()) {
                InputDevice d = inputManager.getInputDevice(id);
                if (d == null) continue;
                JSONObject info = new JSONObject();
                info.put("name", d.getName());
                info.put("sources", "0x" + Integer.toHexString(d.getSources()));
                info.put("virtual", d.isVirtual());
                devices.put(info);
                if (!isPad(d)) continue;
                knownPads.add(id);
                if (primary == null || rank(d) > rank(primary)) primary = d;
                for (InputDevice.MotionRange r : d.getMotionRanges()) {
                    if ((r.getSource() & InputDevice.SOURCE_CLASS_JOYSTICK) == 0) continue;
                    int a = r.getAxis();
                    if (a < 0 || a >= MAX_AXIS || !rangeAxes.add(a)) continue;
                    reported[a] = true;
                    JSONObject j = new JSONObject();
                    j.put("axis", a);
                    j.put("name", axisName(a));
                    j.put("min", finite(r.getMin()));
                    j.put("max", finite(r.getMax()));
                    j.put("flat", finite(r.getFlat()));
                    ranges.put(j);
                }
                boolean[] has = d.hasKeys(PROBE_KEYS);
                for (int i = 0; i < PROBE_KEYS.length; i++) if (has[i]) keys.add(PROBE_KEYS[i]);
            }
            if (primary != null) {
                o.put("id", primary.getId());
                o.put("name", primary.getName());
                o.put("vendor", primary.getVendorId());
                o.put("product", primary.getProductId());
                o.put("sources", primary.getSources());
                o.put("pads", knownPads.size());
                o.put("android", Build.VERSION.SDK_INT);
                o.put("axes", ranges);
                JSONArray k = new JSONArray();
                for (int code : keys) k.put(code);
                o.put("keys", k);
            }
            o.put("devices", devices);
        } catch (JSONException ignored) {
            // A partial description is still useful.
        }
        int newPrimary = primary != null ? primary.getId() : -1;
        if (newPrimary != primaryId) { Arrays.fill(down, false); Arrays.fill(axes, 0f); }
        primaryId = newPrimary;
        deviceJson = o.toString();
        deviceVersion++;
    }

    @Override public void onInputDeviceAdded(int id) { rescan(); }
    @Override public void onInputDeviceRemoved(int id) { rescan(); }
    @Override public void onInputDeviceChanged(int id) { rescan(); }

    /**
     * One snapshot, as a compact string of '|'-separated fields:
     * held key codes (comma list) | axis:value*1000 pairs | keyEvents,stickEvents,pointerEvents,otherEvents |
     * lastKey | primaryId,deviceVersion,padCount | lastKeyName | lastStick | lastPointer
     */
    @JavascriptInterface
    public synchronized String state() {
        StringBuilder sb = new StringBuilder(256);
        boolean first = true;
        for (int k = 1; k < MAX_KEY; k++) {
            if (!down[k]) continue;
            if (!first) sb.append(',');
            sb.append(k);
            first = false;
        }
        sb.append('|');
        first = true;
        for (int a = 0; a < MAX_AXIS; a++) {
            if (!reported[a]) continue;
            if (!first) sb.append(',');
            sb.append(a).append(':').append(Math.round(axes[a] * 1000f));
            first = false;
        }
        sb.append('|').append(keyEvents).append(',').append(stickEvents).append(',').append(pointerEvents).append(',').append(otherEvents);
        sb.append('|').append(lastKey);
        sb.append('|').append(primaryId).append(',').append(deviceVersion).append(',').append(knownPads.size());
        sb.append('|').append(lastKeyName);
        sb.append('|').append(lastStick.replace('|', ' '));
        sb.append('|').append(lastPointer.replace('|', ' '));
        return sb.toString();
    }

    /** JSON description of the controller(s): name, ids, joystick axes with ranges, key codes, and every input device. */
    @JavascriptInterface
    public synchronized String device() { return deviceJson; }

    /** Best-effort rumble. strong/weak 0..1. Many Android builds cannot vibrate a DS4; then nothing happens. */
    @JavascriptInterface
    public void rumble(float strong, float weak, int ms) {
        try {
            InputDevice dev;
            synchronized (this) { dev = primaryId >= 0 ? inputManager.getInputDevice(primaryId) : null; }
            if (dev == null || ms <= 0) return;
            if (Build.VERSION.SDK_INT >= 31) {
                VibratorManager vm = dev.getVibratorManager();
                int[] ids = vm.getVibratorIds();
                for (int i = 0; i < ids.length; i++) {
                    float level = ids.length > 1 ? (i == 0 ? strong : weak) : Math.max(strong, weak);
                    if (level <= 0.01f) continue;
                    int amp = Math.max(1, Math.min(255, Math.round(level * 255)));
                    vm.getVibrator(ids[i]).vibrate(VibrationEffect.createOneShot(ms, amp));
                }
            } else {
                Vibrator v = dev.getVibrator();
                if (v == null || !v.hasVibrator()) return;
                int amp = Math.max(1, Math.min(255, Math.round(Math.max(strong, weak) * 255)));
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(ms, amp));
                else v.vibrate(ms);
            }
        } catch (RuntimeException ignored) {
            // Rumble is a nicety; never let it break input.
        }
    }
}
