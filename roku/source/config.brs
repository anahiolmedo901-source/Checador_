sub SaveDisplayConfig(backend as String, code as String, token as String)
    section = CreateObject("roRegistrySection", "Checador")
    section.Write("backend", backend)
    section.Write("code", code)
    section.Write("token", token)
    section.Flush()
end sub

sub ClearDisplayConfig()
    section = CreateObject("roRegistrySection", "Checador")
    section.Delete("backend")
    section.Delete("code")
    section.Delete("token")
    section.Flush()
end sub

function LoadDisplayConfig() as Object
    section = CreateObject("roRegistrySection", "Checador")
    return {
        backend: validStr(section.Read("backend")),
        code: validStr(section.Read("code")),
        token: validStr(section.Read("token"))
    }
end function

function validStr(value as Dynamic) as String
    if value = invalid then return ""
    return value.ToStr()
end function