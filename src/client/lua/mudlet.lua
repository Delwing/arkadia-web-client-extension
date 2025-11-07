function string:starts(prefix)
    return string.sub(self, 1, string.len(prefix)) == prefix
end

function magic_prefix(text)
    text = string.format("[ %s ] ", text)
    prefix(text)
    if selectString(text, 1) > -1 then
        fg("orange")
    end
    resetFormat()
end