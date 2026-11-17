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

/**
 * Reads the DualShock 4 natively and hands its state to the game.
 *
 * Android TV WebViews list a connected gamepad through the W3C Gamepad API but often never
 * deliver its button or stick events, so the game cannot rely on it. Instead MainActivity
 * feeds every gamepad KeyEvent and MotionEvent into this class, which keeps a snapshot that
 * the game polls once per frame through {@code window.AndroidPad.state()}.
 *
 * Buttons are recognised by Android's semantic key codes (BUTTON_A = Cross, BUTTON_B =
 * Circle, BUTTON_X = Square, BUTTON_Y = Triangle, ...), which the system's key layout files
 * apply to the DualShock 4 regardless of kernel or connection type.
 */
public class GamepadBridge implements InputManager.InputDeviceListener {
    // Same order as BUTTONS in web/src/input.js.
    static final int CROSS = 0, CIRCLE = 1, SQUARE = 2, TRIANGLE = 3, L1 = 4, R1 = 5, L2 = 6, R2 = 7,
            SHARE = 8, OPTIONS = 9, L3 = 10, R3 = 11, UP = 12, DOWN = 13, LEFT = 14, RIGHT = 15,
            PS = 16, TOUCHPAD = 17, COUNT = 18;
    private static final String[] NAMES = {"cross", "circle", "square", "triangle", "l1", "r1", "l2", "r2",
            "share", "options", "l3", "r3", "up", "down", "left", "right", "ps", "touchpad"};

    private final Context context;
    private final InputManager inputManager;
    private final boolean[] keyDown = new boolean[COUNT];   // from KeyEvents
    private boolean hatUp, hatDown, hatLeft, hatRight;       // from AXIS_HAT_X / AXIS_HAT_Y
    private float lx, ly, rx, ry, l2, r2;
    private int deviceId = -1;
    private String deviceName = "";
    private String lastButton = "";
    private long events;

    GamepadBridge(Context context) {
        this.context = context;
        this.inputManager = (InputManager) context.getSystemService(Context.INPUT_SERVICE);
        inputManager.registerInputDeviceListener(this, new Handler(Looper.getMainLooper()));
        rescan();
    }

    void release() { inputManager.unregisterInputDeviceListener(this); }

    static boolean isGamepad(int source) {
        return (source & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                || (source & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
    }

    private static int buttonFor(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_BUTTON_A: return CROSS;
            case KeyEvent.KEYCODE_BUTTON_B: return CIRCLE;
            case KeyEvent.KEYCODE_BUTTON_X: return SQUARE;
            case KeyEvent.KEYCODE_BUTTON_Y: return TRIANGLE;
            case KeyEvent.KEYCODE_BUTTON_L1: return L1;
            case KeyEvent.KEYCODE_BUTTON_R1: return R1;
            case KeyEvent.KEYCODE_BUTTON_L2: return L2;
            case KeyEvent.KEYCODE_BUTTON_R2: return R2;
            case KeyEvent.KEYCODE_BUTTON_SELECT: return SHARE;
            case KeyEvent.KEYCODE_BUTTON_START: return OPTIONS;
            case KeyEvent.KEYCODE_MENU: return OPTIONS;
            case KeyEvent.KEYCODE_BUTTON_THUMBL: return L3;
            case KeyEvent.KEYCODE_BUTTON_THUMBR: return R3;
            case KeyEvent.KEYCODE_BUTTON_MODE: return PS;
            case KeyEvent.KEYCODE_BUTTON_1: return TOUCHPAD;
            case KeyEvent.KEYCODE_DPAD_UP: return UP;
            case KeyEvent.KEYCODE_DPAD_DOWN: return DOWN;
            case KeyEvent.KEYCODE_DPAD_LEFT: return LEFT;
            case KeyEvent.KEYCODE_DPAD_RIGHT: return RIGHT;
            case KeyEvent.KEYCODE_DPAD_CENTER: return CROSS;
            case KeyEvent.KEYCODE_BACK: return CIRCLE; // some layouts send Circle as BACK
            default: return -1;
        }
    }

    /** Returns true if the event came from a gamepad and was consumed. */
    synchronized boolean onKey(KeyEvent event) {
        if (!isGamepad(event.getSource())) return false;
        int b = buttonFor(event.getKeyCode());
        if (b < 0) return true; // unknown gamepad key: swallow it so Android does not act on it
        int action = event.getAction();
        if (action == KeyEvent.ACTION_DOWN) {
            if (!keyDown[b]) lastButton = NAMES[b];
            keyDown[b] = true;
        } else if (action == KeyEvent.ACTION_UP) {
            keyDown[b] = false;
        }
        noteDevice(event.getDevice());
        events++;
        return true;
    }

    /** Returns true if the event came from a gamepad and was consumed. */
    synchronized boolean onMotion(MotionEvent event) {
        if (!isGamepad(event.getSource()) || event.getAction() != MotionEvent.ACTION_MOVE) return false;
        InputDevice dev = event.getDevice();
        lx = axis(event, dev, MotionEvent.AXIS_X);
        ly = axis(event, dev, MotionEvent.AXIS_Y);
        rx = axis(event, dev, MotionEvent.AXIS_Z);
        ry = axis(event, dev, MotionEvent.AXIS_RZ);
        float lt = Math.max(axis(event, dev, MotionEvent.AXIS_LTRIGGER), axis(event, dev, MotionEvent.AXIS_BRAKE));
        float rt = Math.max(axis(event, dev, MotionEvent.AXIS_RTRIGGER), axis(event, dev, MotionEvent.AXIS_GAS));
        // Older DS4 layouts put the triggers on RX/RY in the range -1..1.
        if (dev != null && dev.getMotionRange(MotionEvent.AXIS_LTRIGGER) == null && dev.getMotionRange(MotionEvent.AXIS_BRAKE) == null
                && dev.getMotionRange(MotionEvent.AXIS_RX) != null) {
            lt = (axis(event, dev, MotionEvent.AXIS_RX) + 1f) / 2f;
            rt = (axis(event, dev, MotionEvent.AXIS_RY) + 1f) / 2f;
        }
        l2 = lt; r2 = rt;
        float hx = axis(event, dev, MotionEvent.AXIS_HAT_X), hy = axis(event, dev, MotionEvent.AXIS_HAT_Y);
        boolean up = hy < -0.5f, down = hy > 0.5f, left = hx < -0.5f, right = hx > 0.5f;
        if (up && !hatUp) lastButton = "up";
        if (down && !hatDown) lastButton = "down";
        if (left && !hatLeft) lastButton = "left";
        if (right && !hatRight) lastButton = "right";
        hatUp = up; hatDown = down; hatLeft = left; hatRight = right;
        noteDevice(dev);
        events++;
        return true;
    }

    private static float axis(MotionEvent e, InputDevice dev, int axis) {
        if (dev != null && dev.getMotionRange(axis, e.getSource()) == null) return 0f;
        return e.getAxisValue(axis);
    }

    private void noteDevice(InputDevice dev) {
        if (dev == null) return;
        deviceId = dev.getId();
        deviceName = dev.getName();
    }

    private synchronized void rescan() {
        deviceId = -1; deviceName = "";
        for (int id : inputManager.getInputDeviceIds()) {
            InputDevice dev = inputManager.getInputDevice(id);
            if (dev != null && !dev.isVirtual() && isGamepad(dev.getSources())) { deviceId = id; deviceName = dev.getName(); return; }
        }
    }

    @Override public void onInputDeviceAdded(int id) { rescan(); }
    @Override public void onInputDeviceChanged(int id) { rescan(); }
    @Override public synchronized void onInputDeviceRemoved(int id) {
        if (id == deviceId) { java.util.Arrays.fill(keyDown, false); hatUp = hatDown = hatLeft = hatRight = false; lx = ly = rx = ry = l2 = r2 = 0; }
        rescan();
    }

    /**
     * One snapshot for the game, as a compact string:
     * "<18 digits of 0/1>|lx,ly,rx,ry,l2,r2|connected|events|lastButton|deviceName"
     */
    @JavascriptInterface
    public synchronized String state() {
        StringBuilder sb = new StringBuilder(96);
        for (int i = 0; i < COUNT; i++) {
            boolean on = keyDown[i] || (i == UP && hatUp) || (i == DOWN && hatDown) || (i == LEFT && hatLeft) || (i == RIGHT && hatRight);
            sb.append(on ? '1' : '0');
        }
        sb.append('|').append(lx).append(',').append(ly).append(',').append(rx).append(',').append(ry)
          .append(',').append(l2).append(',').append(r2);
        sb.append('|').append(deviceId >= 0 ? '1' : '0');
        sb.append('|').append(events);
        sb.append('|').append(lastButton);
        sb.append('|').append(deviceName.replace('|', ' '));
        return sb.toString();
    }

    /** Best-effort rumble. strong/weak 0..1. Many Android builds cannot vibrate a DS4; then nothing happens. */
    @JavascriptInterface
    public void rumble(float strong, float weak, int ms) {
        try {
            InputDevice dev;
            synchronized (this) { dev = deviceId >= 0 ? inputManager.getInputDevice(deviceId) : null; }
            if (dev == null || ms <= 0) return;
            int amplitude = Math.max(1, Math.min(255, Math.round(Math.max(strong, weak) * 255)));
            if (Build.VERSION.SDK_INT >= 31) {
                VibratorManager vm = dev.getVibratorManager();
                int[] ids = vm.getVibratorIds();
                if (ids.length == 0) return;
                for (int i = 0; i < ids.length; i++) {
                    float level = ids.length > 1 ? (i == 0 ? strong : weak) : Math.max(strong, weak);
                    if (level <= 0.01f) continue;
                    vm.getVibrator(ids[i]).vibrate(VibrationEffect.createOneShot(ms, Math.max(1, Math.min(255, Math.round(level * 255)))));
                }
            } else {
                Vibrator v = dev.getVibrator();
                if (v == null || !v.hasVibrator()) return;
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(ms, amplitude));
                else v.vibrate(ms);
            }
        } catch (RuntimeException ignored) {
            // Rumble is a nicety; never let it break input.
        }
    }
}
