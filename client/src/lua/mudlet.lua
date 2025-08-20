function string:starts(prefix)
    return string.sub(self, 1, string.len(prefix)) == prefix
end