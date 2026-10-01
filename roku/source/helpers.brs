function CheckTypeLabel(checkType as String) as String
    lower = LCase(checkType)
    if lower = "check_in" then return "Entrada"
    if lower = "check_out" then return "Salida"
    if lower = "break_start" then return "Inicio de descanso"
    if lower = "break_end" then return "Fin de descanso"
    if lower = "late" then return "Retardo"
    if lower = "missing" then return "Falta"
    if lower = "excused" then return "Incidencia"
    return checkType
end function

function CheckTypeColor(checkType as String) as String
    lower = LCase(checkType)
    if lower = "late" then return "0xF59E0B"
    if lower = "missing" then return "0xEF4444"
    if lower = "excused" then return "0x8B5CF6"
    return "0x22C55E"
end function

function MessageColor(checkType as String) as String
    lower = LCase(checkType)
    if lower = "late" then return "0xB45309"
    if lower = "missing" then return "0xB91C1C"
    if lower = "excused" then return "0x7C3AED"
    return "0x15803D"
end function

function Pad2(value as Integer) as String
    if value < 10 then return "0" + value.ToStr()
    return value.ToStr()
end function

function NowClock() as String
    dt = CreateObject("roDateTime")
    return Pad2(dt.GetHours()) + ":" + Pad2(dt.GetMinutes()) + ":" + Pad2(dt.GetSeconds())
end function

function NowDateShort() as String
    dt = CreateObject("roDateTime")
    dow = dt.GetWeekday()
    days = [ "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado" ]
    dayName = "Hoy"
    if dow >= 0 and dow < days.Count() then dayName = days[dow]
    return dayName + " " + Pad2(dt.GetDayOfMonth()) + "/" + Pad2(dt.GetMonth())
end function

function CapReconnectBackoff(current as Integer) as Integer
    if current <= 0 then return 1
    doubled = current * 2
    if doubled > 30 then return 30
    return doubled
end function

function SafeInt(value as Dynamic, fallback as Integer) as Integer
    if value = invalid then return fallback
    asInt = Int(Val(value.ToStr()))
    if asInt <= 0 then return fallback
    return asInt
end function

function SafeStr(value as Dynamic) as String
    if value = invalid then return ""
    return value.ToStr()
end function

function PadRightStr(s as String, length as Integer) as String
    if Len(s) >= length then return Left(s, length)
    return s + String(length - Len(s), " ")
end function

function IsVideoUrl(url as String) as Boolean
    lower = LCase(url)
    if lower.InStr(".m3u8") > 0 then return true
    if lower.InStr(".mp4") > 0 then return true
    if lower.InStr(".mov") > 0 then return true
    if lower.InStr(".ts") > 0 then return true
    return false
end function

function StreamFormatFor(url as String) as String
    lower = LCase(url)
    if lower.InStr(".m3u8") > 0 then return "hls"
    return "mp4"
end function