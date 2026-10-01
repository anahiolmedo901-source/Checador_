sub init()
    m.config = LoadDisplayConfig()
    if Not RokuOs16OrNewer() then
        m.buildUpgradeScreen()
        return
    end if
    m.home = invalid
    m.setup = invalid
    m.upgrade = invalid
    m.pickScreen()
end sub

function RokuOs16OrNewer() as Boolean
    ' roWebSocket solo existe en Roku OS 16.0+ (requerido por el proyecto).
    di = CreateObject("roDeviceInfo")
    if di = invalid then return false
    return IsWebSocketAvailable()
end function

function IsWebSocketAvailable() as Boolean
    ws = CreateObject("roWebSocket")
    return ws <> invalid
end function

sub buildUpgradeScreen()
    m.upgrade = CreateObject("roSGNode", "Group")
    m.top.appendChild(m.upgrade)
    panel = CreateObject("roSGNode", "Poster")
    panel.color = "0x0F172A"
    panel.width = 1200
    panel.height = 300
    panel.translation = [ 160, 290 ]
    panel.opacity = 0.98
    m.upgrade.appendChild(panel)
    message = CreateObject("roSGNode", "Label")
    message.text = "Este canal requiere Roku OS 16 o superior. Actualiza tu dispositivo desde Configuración → Sistema → Actualización del sistema."
    message.color = "0xFFFFFF"
    message.font.size = 34
    message.wrap = true
    message.width = 1000
    message.maxLines = 4
    message.horizAlign = "center"
    message.translation = [ 260, 330 ]
    message.vertAlign = "center"
    m.upgrade.appendChild(message)
end sub

sub pickScreen()
    if m.config.backend <> "" and m.config.code <> "" and m.config.token <> "" then
        m.showHome()
    else
        m.showSetup("initial")
    end if
end sub

sub showHome()
    if m.setup <> invalid then m.setup.visible = false
    if m.home = invalid
        m.home = CreateObject("roSGNode", "HomeScene")
        m.home.observeField("openSetup", "onOpenSetup")
        m.home.backend = m.config.backend
        m.home.code = m.config.code
        m.home.token = m.config.token
    end if
    if m.home.parent = invalid then
        m.top.appendChild(m.home)
        m.home.start = true
    else
        m.home.visible = true
        m.home.start = true
    end if
end sub

sub showSetup(mode as String)
    if m.home <> invalid then m.home.visible = false
    if m.setup = invalid
        m.setup = CreateObject("roSGNode", "SetupScene")
        m.setup.observeField("done", "onSetupDone")
        m.setup.mode = mode
    end if
    m.setup.backend = m.config.backend
    m.setup.code = m.config.code
    m.setup.token = m.config.token
    m.setup.visible = true
    m.setup.start = true
end sub

sub onOpenSetup()
    m.showSetup("edit")
end sub

sub onSetupDone()
    m.config = LoadDisplayConfig()
    if m.config.backend <> "" and m.config.code <> "" and m.config.token <> "" then
        m.showHome()
    end if
end sub