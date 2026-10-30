package ng.rentalhub;

import com.google.gson.*;
import com.machinezoo.sourceafis.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
import java.io.ByteArrayInputStream;
import javax.imageio.ImageIO;

public final class Matcher {
    static final String ENGINE = "sourceafis-3.18.1";
    static byte[] decode(String value, int max) {
        if (value == null || value.length() > max * 4 / 3 + 4) throw new IllegalArgumentException();
        byte[] bytes = Base64.getDecoder().decode(value);
        if (bytes.length == 0 || bytes.length > max) throw new IllegalArgumentException();
        return bytes;
    }
    static FingerprintTemplate image(String value) throws Exception {
        byte[] bytes = decode(value, 300000);
        // Check PNG dimensions before allocating a decoded image.
        if (bytes.length < 24 || !Arrays.equals(Arrays.copyOf(bytes, 8), new byte[]{(byte)137,80,78,71,13,10,26,10})) throw new IllegalArgumentException();
        var header = java.nio.ByteBuffer.wrap(bytes);
        int width = header.getInt(16), height = header.getInt(20);
        if (width < 128 || height < 128 || width > 1024 || height > 1024 || (long)width * height > 600000) throw new IllegalArgumentException();
        var decoded = ImageIO.read(new ByteArrayInputStream(bytes));
        if (decoded == null || decoded.getWidth() != width || decoded.getHeight() != height) throw new IllegalArgumentException();
        return new FingerprintTemplate(new FingerprintImage(bytes, new FingerprintImageOptions().dpi(500)));
    }
    static JsonObject process(JsonObject request) throws Exception {
        var result = new JsonObject();
        result.addProperty("engine", ENGINE);
        String operation = request.get("operation").getAsString();
        if (operation.equals("health")) { result.addProperty("ready", true); return result; }
        double threshold = request.get("threshold").getAsDouble();
        if (!Double.isFinite(threshold) || threshold < 40 || threshold > 1000) throw new IllegalArgumentException();
        var probe = image(request.get("image").getAsString());
        if (operation.equals("enroll")) {
            String first = request.get("image").getAsString(), second = request.get("confirmation").getAsString();
            if (Arrays.equals(decode(first, 300000), decode(second, 300000))) throw new IllegalArgumentException();
            var confirmation = image(second);
            if (new FingerprintMatcher(probe).match(confirmation) < threshold) {
                result.addProperty("matches", false);
            } else {
                result.addProperty("matches", true);
                result.addProperty("template", Base64.getEncoder().encodeToString(probe.toByteArray()));
            }
        } else if (operation.equals("verify")) {
            var candidate = new FingerprintTemplate(decode(request.get("template").getAsString(), 100000));
            result.addProperty("matches", new FingerprintMatcher(probe).match(candidate) >= threshold);
        } else throw new IllegalArgumentException();
        return result;
    }
    public static void main(String[] args) {
        try {
            byte[] input = System.in.readNBytes(850001);
            if (input.length > 850000) throw new IllegalArgumentException();
            var request = JsonParser.parseString(new String(input, StandardCharsets.UTF_8)).getAsJsonObject();
            System.out.print(process(request));
        } catch (Exception error) {
            // Never write biometric input or exception details to process logs.
            System.out.print("{\"error\":\"Invalid fingerprint sample or matching request\"}");
            System.exit(2);
        }
    }
}
