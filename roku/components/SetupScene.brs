sub init()
    m.top.observeField("start", "onStart")
end sub

sub onStart()
    if m.top.start <> true then return
    if m.uilt = invalid then m.buildUi()
    m.uilt.visible = true
end sub

sub buildUi()
    m.uilt = CreateObject("roSGNode", "Group")
    m.top.appendChild(m.uilt)

    bg = CreateObject("roSGNode", "Poster")
    bg.color = "0x0F172A"
    bg.width = 1920
    bg.height = 1080
    m.uilt.appendChild(bg)

    panel = CreateObject("roSGNode", "Poster")
    panel.color = "0x1E293B"
    panel.width = 1100
    panel.height = 760
    panel.translation = [ 410, 150 ]
    panel.opacity = 0.98
    m.uilt.appendChild(panel)

    title = CreateObject("roSGNode", "Label")
    title.text = "Configuración de la pantalla"
    title.color = "0xFFFFFF"
    title.font.size = 56
    title.translation = [ 500, 195 ]
    m.uilt.appendChild(title)

    subtitle = CreateObject("roSGNode", "Label")
    subtitle.text = "Escribe la dirección del servicio y el código temporal que generas en Administración → Pantallas → Conectar TV. El token se valida y guarda automáticamente."
    subtitle.color = "0x94A3B8"
    subtitle.font.size = 24
    subtitle.wrap = true
    subtitle.width = 900
    subtitle.translation = [ 500, 270 ]
    m.uilt.appendChild(subtitle)

    m.backendField = m.makeField("Dirección del servicio", "https://api.tuempresa.mx", 360, m.top.backend)
    m.codeField = m.makeField("Código temporal de Administración", "ABCD-EFGH", 480, "")
    m.errorLabel = CreateObject("roSGNode", "Label")
    m.errorLabel.color = "0xFF6B6B"
    m.errorLabel.font.size = 22
    m.errorLabel.width = 850
    m.errorLabel.translation = [ 500, 590 ]
    m.uilt.appendChild(m.errorLabel)

    save = CreateObject("roSGNode", "Button")
    save.text = "Guardar y conectar"
    save.id = "saveButton"
    save.translation = [ 520, 650 ]
    save.minWidth = 220
    save.observeField("buttonSelected", "onSave")
    m.uilt.appendChild(save)

    reset = CreateObject("roSGNode", "Button")
    reset.text = "Cambiar conexión"
    reset.id = "resetButton"
    reset.translation = [ 760, 650 ]
    reset.minWidth = 220
    reset.observeField("buttonSelected", "onReset")
    m.uilt.appendChild(reset)

    m.startTimer = CreateObject("roSGNode", "Timer")
    m.startTimer.duration = 0.1
    m.startTimer.repeat = false
    m.startTimer.observeField("fire", "focusFirst")
    m.uilt.appendChild(m.startTimer)
    m.startTimer.control = "start"
end sub

sub focusFirst()
    if m.backendField <> invalid then m.backendField.setFocus(true)
end sub

function makeField(hint as String, placeholder as String, y as Integer, value as String) as Object
    label = CreateObject("roSGNode", "Label")
    label.text = hint
    label.color = "0xFFFFFF"
    label.font.size = 26
    label.translation = [ 500, y ]
    m.uilt.appendChild(label)

    edit = CreateObject("roSGNode", "EditText")
    edit.id = "field_" + y.ToStr()
    edit.width = 800
    edit.height = 60
    edit.translation = [ 500, y + 40 ]
    edit.text = value
    edit.hintText = placeholder
    edit.color = "0xE2E8F0"
    edit.keyboardDominoFocus = true
    keyboard = CreateObject("roSGNode", "StandardKeyboardDialog")
    keyboard.title = hint
    edit.keyboard = keyboard
    m.uilt.appendChild(edit)
    return edit
end function

sub onSave()
    backend = LTrim(m.backendField.text)
    pairingCode = ""
    rawCode = UCase(m.codeField.text)
    for i = 1 to Len(rawCode)
        char = Mid(rawCode, i, 1)
        if char <> "-" and char <> " " then pairingCode = pairingCode + char
    end for
    if backend = "" or Len(pairingCode) <> 8 then
        m.errorLabel.text = "Ingresa la dirección del servicio y el código de 8 caracteres."
        return
    end if
    if Right(backend, 1) <> "/" then backend = backend + "/"
    m.errorLabel.text = "Validando código…"
    req = CreateObject("roUrlTransfer")
    port = CreateObject("roMessagePort")
    req.SetUrl(backend + "api/displays/pair")
    req.AddHeader("Content-Type", "application/json")
    req.SetRequest("POST")
    req.SetMessagePort(port)
    body = FormatJson({
        pairing_code: pairingCode
        software: "checador-roku"
    })
    if not req.AsyncPostFromString(body) then
        m.errorLabel.text = "No se pudo conectar con el servicio. Revisa la dirección y la red."
        return
    end if
    msg = port.WaitMessage(10000)
    if msg = invalid or type(msg) <> "roUrlEvent" then
        m.errorLabel.text = "El servicio tardó demasiado. Intenta de nuevo."
        return
    end if
    if msg.GetResponseCode() <> 200 then
        m.errorLabel.text = "Código incorrecto, vencido o ya utilizado. Genera uno nuevo en Administración."
        return
    end if
    data = ParseJson(msg.GetString())
    if data = invalid or data.ok <> true or data.token = invalid or data.display = invalid then
        m.errorLabel.text = "No se pudo validar el código. Genera uno nuevo en Administración."
        return
    end if
    code = data.display.code
    token = data.token
    SaveDisplayConfig(backend, code, token)
    m.top.done = { saved: true, backend: backend, code: code, token: token }
end sub

sub onReset()
    ClearDisplayConfig()
    m.top.done = { saved: false }
end sub
