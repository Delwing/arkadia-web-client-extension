export function LetterComposer() {
    return (
        <div id="letter-composer" className="letter-composer" hidden>
            <div className="letter-composer-header">
                <span>Nowy list</span>
                <button type="button" className="btn-close btn-close-white" aria-label="Zamknij" data-letter-close />
            </div>
            <form className="letter-composer-form">
                <div className="letter-composer-field">
                    <label htmlFor="letter-to" className="form-label">
                        Do:
                    </label>
                    <input id="letter-to" name="letter-to" className="form-control form-control-sm" type="text" autoComplete="off" />
                </div>
                <div className="letter-composer-field">
                    <label htmlFor="letter-cc" className="form-label">
                        CC:
                    </label>
                    <input id="letter-cc" name="letter-cc" className="form-control form-control-sm" type="text" autoComplete="off" />
                </div>
                <div className="letter-composer-field">
                    <label htmlFor="letter-subject" className="form-label">
                        Temat:
                    </label>
                    <input
                        id="letter-subject"
                        name="letter-subject"
                        className="form-control form-control-sm"
                        type="text"
                        autoComplete="off"
                    />
                </div>
                <div className="letter-composer-field">
                    <label htmlFor="letter-content" className="form-label">
                        Treść:
                    </label>
                    <textarea id="letter-content" name="letter-content" className="form-control" rows={10} />
                </div>
                <div className="letter-composer-actions">
                    <div className="letter-template-group">
                        <label htmlFor="letter-template" className="form-label mb-0">
                            Szablon:
                        </label>
                        <select id="letter-template" name="letter-template" className="form-select form-select-sm letter-template-select">
                            <option value="none">No template</option>
                            <option value="plain">Zwykly</option>
                            <option value="parchment">Pergamin</option>
                            <option value="parchment2">Pergamin II</option>
                            <option value="parchment3">Pergamin III</option>
                        </select>
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" data-letter-preview>
                        Podgląd
                    </button>
                    <button type="submit" className="btn btn-primary btn-sm">
                        Wyślij
                    </button>
                </div>
            </form>
        </div>
    );
}
