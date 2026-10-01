sub AssertEqual(a as Dynamic, b as Dynamic, name as String)
    if a.ToStr() = b.ToStr() then
        print "OK   " + name
    else
        print "FAIL " + name + ": got [" + a.ToStr() + "] want [" + b.ToStr() + "]"
    end if
end sub

AssertEqual(CheckTypeLabel("check_in"), "Entrada", "label check_in")
AssertEqual(CheckTypeLabel("check_out"), "Salida", "label check_out")
AssertEqual(CheckTypeLabel("break_start"), "Inicio de descanso", "label break_start")
AssertEqual(CheckTypeLabel("late"), "Retardo", "label late")
AssertEqual(CheckTypeLabel("missing"), "Falta", "label missing")
AssertEqual(CheckTypeLabel("excused"), "Incidencia", "label excused")
AssertEqual(CheckTypeColor("missing"), "0xEF4444", "color missing")
AssertEqual(CheckTypeColor("late"), "0xF59E0B", "color late")
AssertEqual(CheckTypeColor("check_in"), "0x22C55E", "color check_in")
AssertEqual(CapReconnectBackoff(0), 1, "backoff 0")
AssertEqual(CapReconnectBackoff(2), 4, "backoff 2")
AssertEqual(CapReconnectBackoff(40), 30, "backoff cap")
AssertEqual(PadRightStr("Ana", 6), "Ana   ", "pad")
AssertEqual(PadRightStr("1234567", 5), "12345", "pad trunc")
AssertEqual(StreamFormatFor("http://cdn/a/f.m3u8"), "hls", "hls")
AssertEqual(StreamFormatFor("http://cdn/a/f.mp4"), "mp4", "mp4")
AssertEqual(IsVideoUrl("http://cdn/a/poster.png"), false, "png not video")
AssertEqual(IsVideoUrl("http://cdn/a/c.mp4"), true, "mp4 is video")
AssertEqual(SafeStr(invalid), "", "safe invalid")
AssertEqual(SafeInt(12, 8), 12, "safeint 12")
AssertEqual(SafeInt(0, 8), 8, "safeint 0")
AssertEqual(SafeInt(invalid, 8), 8, "safeint invalid")
print "SMOKE_DONE"