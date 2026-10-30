package ng.rentalhub;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import com.google.gson.JsonParser;

class MatcherTest {
    @Test void healthLoadsThePinnedEngine() throws Exception {
        var result = Matcher.process(JsonParser.parseString("{\"operation\":\"health\"}").getAsJsonObject());
        assertTrue(result.get("ready").getAsBoolean());
        assertEquals("sourceafis-3.18.1", result.get("engine").getAsString());
    }
    @Test void rejectsMalformedImages() {
        assertThrows(Exception.class, () -> Matcher.image("bm90IGFuIGltYWdl"));
        assertThrows(Exception.class, () -> Matcher.image("!"));
    }
    @Test void rejectsUnsafeThreshold() {
        assertThrows(Exception.class, () -> Matcher.process(JsonParser.parseString("{\"operation\":\"verify\",\"threshold\":0}").getAsJsonObject()));
    }
    @Test void rejectsDecompressionBombDimensions() {
        var bytes = java.nio.ByteBuffer.allocate(24);
        bytes.put(new byte[]{(byte)137,80,78,71,13,10,26,10});
        bytes.putInt(16, Integer.MAX_VALUE); bytes.putInt(20, Integer.MAX_VALUE);
        assertThrows(Exception.class, () -> Matcher.image(java.util.Base64.getEncoder().encodeToString(bytes.array())));
    }
}
