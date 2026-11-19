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

/**
 * Raw controller pipe from Android to the game.
 *
 * Android TV WebViews list a connected gamepad through the W3C Gamepad API but often never
 * deliver its events, so MainActivity feeds every controller KeyEvent and MotionEvent in here
 * instead. This class does not decide what anything means: it reports which Android key codes
 * are held and the value of every joystick axis, plus a description of the controller. The game
 * (web/src/input.js) maps those to buttons and sticks, because different Android builds lay the
 * DualShock 4 out differently (Sony key layout files, Generic.kl, old and new kernel drivers).
 *
 * The game polls {@code window.AndroidPad.state()} once per frame and calls
 * {@code window.AndroidPad.device()} when the controller changes.
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
    private int activeId = -1;
    private boolean activeHasButtons;
    private int deviceVersion;
    private String deviceJson = "{}";
    private int padCount;
    private long keyEvents, motionEvents, otherMotion;
    private int lastKey = -1, lastMotionSource, lastOtherSource;
    private String lastKeyName = "";

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

    private static boolean isPad(InputDevice dev) {
        if (dev == null || dev.isVirtual()) return false;
        int s = dev.getSources();
        return (s & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                || (s & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
    }

    private static boolean hasButtons(InputDevice dev) {
        return dev != null && (dev.getSources() & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD;
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
        if (dev != null && dev.getId() != activeId && isPad(dev)) select(dev);
        // Consumed even if unmapped, so Android cannot turn Circle into BACK or the D-pad into focus moves.
        return true;
    }

    /** Returns true if the event came from a controller stick, trigger or hat and was consumed. */
    synchronized boolean onMotion(MotionEvent event) {
        int source = event.getSource();
        InputDevice dev = event.getDevice();
        if ((source & InputDevice.SOURCE_CLASS_JOYSTICK) == 0) {
            // Pointer-style events from a controller (the DS4 touchpad, a TV "mouse mode") are
            // counted for the diagnostics panel and left for the page.
            if (isPad(dev)) { otherMotion++; lastOtherSource = source; }
            return false;
        }
        motionEvents++;
        lastMotionSource = source;
        if (dev != null && dev.getId() != activeId) {
            // A button-less joystick node (e.g. a motion-sensor device) must not hijack the sticks.
            if (activeHasButtons && !hasButtons(dev)) return true;
            select(dev);
        }
        for (int a = 0; a < MAX_AXIS; a++) {
            if (reported[a]) axes[a] = event.getAxisValue(a);
        }
        return true;
    }

    private static String axisName(int axis) {
        return MotionEvent.axisToString(axis).replace("AXIS_", "");
    }

    private static double finite(float v) { return Float.isNaN(v) || Float.isInfinite(v) ? 0 : v; }

    private void select(InputDevice dev) {
        activeId = dev.getId();
        activeHasButtons = hasButtons(dev);
        Arrays.fill(reported, false);
        Arrays.fill(axes, 0f);
        for (int a : COMMON_AXES) reported[a] = true;
        JSONObject o = new JSONObject();
        try {
            o.put("id", dev.getId());
            o.put("name", dev.getName());
            o.put("vendor", dev.getVendorId());
            o.put("product", dev.getProductId());
            o.put("sources", dev.getSources());
            o.put("android", Build.VERSION.SDK_INT);
            JSONArray ranges = new JSONArray();
            for (InputDevice.MotionRange r : dev.getMotionRanges()) {
                if ((r.getSource() & InputDevice.SOURCE_CLASS_JOYSTICK) == 0) continue;
                int a = r.getAxis();
                if (a >= 0 && a < MAX_AXIS) reported[a] = true;
                JSONObject j = new JSONObject();
                j.put("axis", a);
                j.put("name", axisName(a));
                j.put("min", finite(r.getMin()));
                j.put("max", finite(r.getMax()));
                j.put("flat", finite(r.getFlat()));
                ranges.put(j);
            }
            o.put("axes", ranges);
            boolean[] has = dev.hasKeys(PROBE_KEYS);
            JSONArray keys = new JSONArray();
            for (int i = 0; i < PROBE_KEYS.length; i++) if (has[i]) keys.put(PROBE_KEYS[i]);
            o.put("keys", keys);
        } catch (JSONException ignored) {
            // A partial description is still useful.
        }
        deviceJson = o.toString();
        deviceVersion++;
    }

    private synchronized void rescan() {
        int count = 0;
        boolean activeAlive = false;
        InputDevice best = null;
        for (int id : inputManager.getInputDeviceIds()) {
            InputDevice d = inputManager.getInputDevice(id);
            if (!isPad(d)) continue;
            count++;
            if (id == activeId) activeAlive = true;
            if (best == null || (hasButtons(d) && !hasButtons(best))) best = d;
        }
        padCount = count;
        if (!activeAlive) {
            activeId = -1;
            activeHasButtons = false;
            deviceJson = "{}";
            deviceVersion++;
            Arrays.fill(down, false);
            Arrays.fill(axes, 0f);
            Arrays.fill(reported, false);
            if (best != null) select(best);
        }
    }

    @Override public void onInputDeviceAdded(int id) { rescan(); }
    @Override public void onInputDeviceRemoved(int id) { rescan(); }
    @Override public synchronized void onInputDeviceChanged(int id) {
        InputDevice d = inputManager.getInputDevice(id);
        if (id == activeId && isPad(d)) select(d); else rescan();
    }

    /**
     * One snapshot, as a compact string of six '|'-separated fields:
     * held key codes (comma list) | axis:value*1000 pairs | keyEvents,motionEvents,otherMotion |
     * lastKey,lastMotionSource,lastOtherSource | deviceId,deviceVersion,padCount | lastKeyName
     */
    @JavascriptInterface
    public synchronized String state() {
        StringBuilder sb = new StringBuilder(200);
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
        sb.append('|').append(keyEvents).append(',').append(motionEvents).append(',').append(otherMotion);
        sb.append('|').append(lastKey).append(',').append(lastMotionSource).append(',').append(lastOtherSource);
        sb.append('|').append(activeId).append(',').append(deviceVersion).append(',').append(padCount);
        sb.append('|').append(lastKeyName);
        return sb.toString();
    }

    /** JSON description of the active controller: name, ids, joystick axes with ranges, key codes it can produce. */
    @JavascriptInterface
    public synchronized String device() { return deviceJson; }

    /** Best-effort rumble. strong/weak 0..1. Many Android builds cannot vibrate a DS4; then nothing happens. */
    @JavascriptInterface
    public void rumble(float strong, float weak, int ms) {
        try {
            InputDevice dev;
            synchronized (this) { dev = activeId >= 0 ? inputManager.getInputDevice(activeId) : null; }
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
