import { App, Editor, Plugin, PluginSettingTab, Setting, moment, Platform, Notice, setIcon, Events } from 'obsidian';
import {
	ViewUpdate,
	PluginValue,
	EditorView,
	ViewPlugin,
	WidgetType,
	Decoration,
	DecorationSet
} from "@codemirror/view";
import { on } from 'events';

interface DateMatch {
	from: number;
	to: number;
	value: string;
	format: DateFormat;
}
interface DateFormat {
	regex: RegExp;
	formatToUser: string;
	formatToPicker: string;
}

class PickerButtonWidget extends WidgetType {
	toDOM(view: EditorView): HTMLElement {
		const button = document.createElement('span');
		button.className = 'datepicker-button';
		setIcon(button, 'calendar');
		return button;
	}
	ignoreEvent() { return false };
	eq(): boolean {
		return true;
	}
}

function pickerButtons(dateMatches: DateMatch[]) {
	const buttons = [];
	for (const dateMatch of dateMatches) {
		let buttonDeco = Decoration.widget({
			widget: new PickerButtonWidget(),
			side: -1
		})
		buttons.push(buttonDeco.range(dateMatch.from));
	}
	return Decoration.set(buttons, true);
}

class DatepickerCMPlugin implements PluginValue {

	private view: EditorView;
	private previousDocumentTop: number | undefined;
	datepickerScrollPositionHandler = () => {
		const datepickerContainer = activeDocument.getElementById('datepicker-container');
		if (datepickerContainer) {
			const { documentTop } = this.view;
			if (this.previousDocumentTop === undefined) {
				this.previousDocumentTop = documentTop;
				return;
			}
			datepickerContainer.style.top =
				`${parseFloat(datepickerContainer.style.top) + documentTop - this.previousDocumentTop}px`;
			this.previousDocumentTop = documentTop;
		} else this.previousDocumentTop = undefined;
	}

	private getAllDates(view: EditorView): DateMatch[] {
		const textView = view.state.doc.toString();
		const formats: DateFormat[] = [
			{
				regex: /\d{4}[-\/\\.]{1}\d{1,2}[-\/\\.]{1}\d{1,2}[ T]\d{1,2}:\d{1,2}( )?([apm]{2})/ig,
				formatToUser: "YYYY-MM-DD hh:mm A",
				formatToPicker: "YYYY-MM-DDTHH:mm"
			},
			{
				regex: /\d{4}[-\/\\.]{1}\d{1,2}[-\/\\.]{1}\d{1,2}[ T]\d{1,2}:\d{1,2}/g,
				formatToUser: "YYYY-MM-DD HH:mm",
				formatToPicker: "YYYY-MM-DDTHH:mm"
			},
			{
				regex: /\d{1,2}[-\/\\.]{1}\d{1,2}[-\/\\.]{1}\d{4} \d{1,2}:\d{1,2}( )?([apm]{2})/ig,
				formatToUser: "DD-MM-YYYY hh:mm A",
				formatToPicker: "YYYY-MM-DDTHH:mm"
			},
			{
				regex: /\d{1,2}[-\/\\.]{1}\d{4}[ T]\d{1,2}:\d{1,2}/g,
				formatToUser: "DD-MM-YYYY HH:mm",
				formatToPicker: "YYYY-MM-DDTHH:mm"
			},
			{
				regex: /\d{4}[-\/\\.]{1}\d{1,2}[-\/\\.]{1}\d{1,2}/g,
				formatToUser: "YYYY-MM-DD",
				formatToPicker: "YYYY-MM-DD",

			},
			{
				regex: /\d{1,2}[-\/\\.]{1}\d{1,2}[-\/\\.]{1}\d{4}/g,
				formatToUser: "DD-MM-YYYY",
				formatToPicker: "YYYY-MM-DD"

			}
		]
		let matchingDate: RegExpExecArray | null;
		let dateMatches: DateMatch[] = [];

		for (const format of formats) {
			while ((matchingDate = format.regex.exec(textView ?? "")) !== null) {

				if (dateMatches.some((match) => match.from === matchingDate?.index)) {
					continue;
				}
				dateMatches.push({ from: matchingDate.index, to: matchingDate.index + matchingDate[0].length, value: matchingDate[0], format: format });
			}
		}
		return dateMatches;
	}

	decorations: DecorationSet;

	constructor(view: EditorView) {
		this.view = view;
		view.scrollDOM.addEventListener("scroll", this.datepickerScrollPositionHandler);
		this.dates = this.getAllDates(view);
		if (DatepickerPlugin.settings.showButtons)
			this.decorations = pickerButtons(this.dates);
	}

	public datepicker: Datepicker | undefined = undefined;
	private previousDateMatch: DateMatch;
	dates: DateMatch[] = [];

	openDatepicker(view: EditorView, match: DateMatch) {

		const dateToPicker = moment(match.value, [
			"YYYY-MM-DD hh:mm A"
			, "YYYY-MM-DDThh:mm"
			, "YYYY-MM-DD hh:mma"
			, "YYYY.MM.DD HH:mm"
			, "DD-MM-YYYY HH:mm"
			, "DD-MM-YYYY hh:mm A"
			, "DD-MM-YYYY hh:mma"
		], false).format(match.format.formatToPicker);

		view.requestMeasure({
			read: state => {
				let pos = state.coordsAtPos(match.from);
				return pos;
			},
			write: pos => {
				if (!pos) return;
				this.datepicker = new Datepicker();
				this.datepicker.open(pos, match.from, dateToPicker
					, (result) => {
						const resultFromPicker = moment(result);
						if (!resultFromPicker.isValid()) {
							return;
						}
						const dateFromPicker = resultFromPicker.format(match.format.formatToUser);
						if (dateFromPicker === match.value) return;
						view.dispatch({
							changes: {
								from: match.from,
								to: match.to,
								insert: dateFromPicker
							}
						})
					});
			}
		});

	}
	// flag to prevent closing the datepicker in editor update when it is opened by button
	public pickerOpenedByButton = false;
	public updateFinished = false;
	update(update: ViewUpdate) {
		this.updateFinished = false;
		/*
		CM fires two update events for selection change,
		I use the below code section to ignore the second one
		otherwise the datepicker flashes as it closes and reopens
	*/
		if (update.docChanged === false &&
			update.state.selection.main.from === update.startState.selection.main.from &&
			update.state.selection.main.to === update.startState.selection.main.to
		) return;

		this.dates = this.getAllDates(update.view);

		if (update.docChanged || update.viewportChanged) {
			if (DatepickerPlugin.settings.showButtons)
				this.decorations = pickerButtons(this.dates);
		}


		const { view } = update;
		const cursorPosition = view.state.selection.main.head;

		const match = this.dates.find(date => date.from <= cursorPosition && date.to >= cursorPosition);
		if (match) {
			if (this.previousDateMatch !== undefined && this.datepicker !== undefined) {
				// prevent reopening date picker on the same date field when closed by button
				if (this.previousDateMatch.from === match.from && this.datepicker.closedByButton) return;
			}
			this.previousDateMatch = match;
			this.datepicker?.closeAll();
			if (DatepickerPlugin.settings.showAutomatically) {
				this.openDatepicker(view, match);
			}

		} else {
			if (this.datepicker !== undefined) {
				this.datepicker.closeAll();
				this.datepicker = undefined;
			}
		}
		this.updateFinished = true;
	}


	destroy() {
		this.view.scrollDOM.removeEventListener("scroll", this.datepickerScrollPositionHandler);
	}
}
export const datepickerCMPlugin = ViewPlugin.fromClass(DatepickerCMPlugin, {
	decorations: (v) => {
		if (DatepickerPlugin.settings.showButtons)
			return v.decorations
		else {
			return Decoration.set([]);
		}
	},

	eventHandlers: {
		mousedown: (e, view) => {
			datepickerButtonEventHandler(e, view);
		},
		touchend: (e, view) => {
			datepickerButtonEventHandler(e, view);
		}
	}
});

function datepickerButtonEventHandler(e: Event, view: EditorView) {
	let target = e.target as HTMLElement
	const dpCMPlugin = view.plugin(datepickerCMPlugin);
	if (target.matches(".datepicker-button, .datepicker-button *")) {
		e.preventDefault();
		const cursorPositionAtButton = view.posAtDOM(target);
		// this toggles showing the datepicker if it is already open at the button position
		if (dpCMPlugin!.datepicker?.cursorPosition !== undefined && dpCMPlugin?.datepicker.cursorPosition === cursorPositionAtButton && Datepicker.isOpened) {
			dpCMPlugin!.datepicker.closeAll();
			dpCMPlugin!.datepicker.closedByButton = true; // to prevent from opening again on selecting same date field
		} else {
			dpCMPlugin!.datepicker?.closeAll();
			dpCMPlugin!.pickerOpenedByButton = true;
			setTimeout(() => {// delay to wait for editor update to finish, otherwise
				// datepicker flashes and reopens in previous/wrong position
				dpCMPlugin?.openDatepicker(view,
					dpCMPlugin.dates.find(
						date => date.from <= cursorPositionAtButton && date.to >= cursorPositionAtButton)!
					,);
			}, 100);
		}
	}
}

interface DatepickerPluginSettings {
	showButtons: boolean;
	showAutomatically: boolean;
	immediatelyShowCalendar: boolean;
	autofocus: boolean;
	focusOnArrowDown: boolean;
}

const DEFAULT_SETTINGS: DatepickerPluginSettings = {
	showButtons: true,
	showAutomatically: false,
	immediatelyShowCalendar: false,
	autofocus: false,
	focusOnArrowDown: false,
}

export default class DatepickerPlugin extends Plugin {

	public static settings: DatepickerPluginSettings = DEFAULT_SETTINGS;

	async onload() {

		await this.loadSettings();

		this.registerEditorExtension(datepickerCMPlugin);

		this.addCommand({
			id: 'insert-date',
			name: 'Insert new date',
			editorCallback: (editor: Editor) => {
				// @ts-expect-error, not typed
				const editorView = editor.cm as EditorView;
				const cursorPosition = editorView.state.selection.main.to;
				if (cursorPosition === undefined) return;
				const pos = editorView.coordsAtPos(cursorPosition);
				if (!pos) return;

				const datepicker = new Datepicker()
				datepicker.open(
					{ top: pos.top, left: pos.left, right: pos.right, bottom: pos.bottom }, cursorPosition,
					"", (result) => {
						if (moment(result).isValid() === true) {
							editor.replaceSelection(moment(result).format("YYYY-MM-DD"));
							Datepicker.closeAll();
						} else new Notice("Please enter a valid date");
					}
				)
				datepicker.focus();
			}
		});
		this.addCommand({
			id: 'insert-datetime',
			name: 'Insert new date and time',
			editorCallback: (editor: Editor) => {
				// @ts-expect-error, not typed
				const editorView = editor.cm as EditorView;
				const cursorPosition = editorView.state.selection.main.to;
				if (cursorPosition === undefined) return;
				const pos = editorView.coordsAtPos(cursorPosition);
				if (!pos) return;
				const datepicker = new Datepicker();
				datepicker.open(
					{ top: pos.top, left: pos.left, right: pos.right, bottom: pos.bottom }, cursorPosition,
					"DATEANDTIME", (result) => {
						// TODO: format time according to picker local format
						if (moment(result).isValid() === true) {
							editor.replaceSelection(moment(result).format("YYYY-MM-DD hh:mm A"));
							Datepicker.closeAll();
						}
						else new Notice("Please enter a valid date and time");
					}
				)
				datepicker.focus();
			}
		});

		this.addSettingTab(new DatepickerSettingTab(this.app, this));
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				Datepicker.closeAll();
			}
			)
		)
	}

	onunload() {
	}

	async loadSettings() {
		DatepickerPlugin.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(DatepickerPlugin.settings);
		activeWindow.dispatchEvent(new Event(""));
	}

}

class Datepicker {

	private onSubmit: (result: string) => void;
	public static isOpened = false;
	private pickerContainer: HTMLSpanElement;
	private pickerInput: HTMLInputElement;
	private viewContent: HTMLElement;
	public pickerValue: string;
	public escPressed = false;
	public cursorPosition: number;
	public closedByButton = false;
	public openedByButton = false;

	constructor() {
		this.closeAll();
	}


	public updatePosition(pos: { top: number, left: number, right: number, bottom: number }) {
		// TODO: add support for rtl windows: pseudo:if(window.rtl)
		let left = pos.left;
		let bottom = pos.bottom;
		// if added to viewContent the adjust the position
		if (this.viewContent !== undefined) {
			left = pos.left - this.viewContent.getBoundingClientRect().left;
			bottom = pos.bottom - this.viewContent.getBoundingClientRect().top;
		}
		if (bottom + this.pickerContainer.getBoundingClientRect().height > this.viewContent.innerHeight) {
			this.pickerContainer.style.top = (pos.top - this.pickerContainer.getBoundingClientRect().height) + 'px';
		} else this.pickerContainer.style.top = bottom + 'px';
		if (left + this.pickerContainer.getBoundingClientRect().width > this.viewContent.innerWidth) {
			this.pickerContainer.style.left = (left - this.pickerContainer.getBoundingClientRect().width) + 'px';
		} else this.pickerContainer.style.left = left + 'px';
	}

	public focus() {
		activeDocument.getElementById('datepicker-input')?.focus();
	}

	public static closeAll() {
		Datepicker.isOpened = false;
		let datepickers = activeDocument.getElementsByClassName("datepicker-widget");
		for (var i = 0; i < datepickers.length; i++) {
			datepickers[i].remove();
		}
	}
	public closeAll() {
		Datepicker.isOpened = false;
		if (!this.escPressed)
			if (moment(this.pickerValue).isValid() === true)
				if (this.onSubmit !== undefined)
					setTimeout(() => this.onSubmit(this.pickerValue), 10);

		let datepickers = activeDocument.getElementsByClassName("datepicker-widget");
		for (var i = 0; i < datepickers.length; i++)
			datepickers[i].remove();
	}

	public open(pos: { top: number, left: number, right: number, bottom: number }, cursorPosition: number,
		datetime: string, onSubmit: (result: string) => void
	) {
		this.onSubmit = onSubmit;
		this.pickerValue = datetime;
		this.cursorPosition = cursorPosition;
		Datepicker.isOpened = true;
		this.escPressed = false;

		this.viewContent = activeDocument.querySelector('body > div.app-container > div.horizontal-main-container > div > div.workspace-split.mod-vertical.mod-root > div > div.workspace-tab-container > div.workspace-leaf.mod-active > div > div.view-content > div.markdown-source-view.cm-s-obsidian.mod-cm6.node-insert-event.is-readable-line-width.is-live-preview.is-folding.show-properties > div') as HTMLElement;
		this.pickerContainer = this.viewContent.createEl('span');
		this.pickerContainer.className = 'datepicker-widget';
		this.pickerContainer.id = 'datepicker-container';
		this.pickerInput = this.pickerContainer.createEl('input');
		if (datetime.length <= 10) this.pickerInput.type = 'date';
		else this.pickerInput.type = 'datetime-local';
		this.pickerInput.id = 'datepicker-input';
		this.pickerInput.value = datetime;
		const acceptButton = this.pickerContainer.createEl('button');
		acceptButton.className = 'datepicker-widget-button';
		setIcon(acceptButton, 'check');
		acceptButton.addEventListener('click', () => acceptButtonEventHandler.call(this));
		acceptButton.addEventListener('touchend', () => acceptButtonEventHandler.call(this));
		function acceptButtonEventHandler(event: Event) {
			if (this.pickerInput.value === '') {
				new Notice('Please enter a valid date');
			} else {
				this.onSubmit(this.pickerInput.value);
				// delay to allow editor to update on submit otherwise picker will immediately reopen
				setTimeout(() => {
					Datepicker.closeAll();
				}, 5);
			}
		}

		const cancelButton = this.pickerContainer.createEl('button');
		cancelButton.className = 'datepicker-widget-button';
		setIcon(cancelButton, 'x');
		cancelButton.addEventListener('click', cancelButtonEventHandler);
		cancelButton.addEventListener('touchend', cancelButtonEventHandler);
		function cancelButtonEventHandler() {
			this.escPressed = true;
			Datepicker.closeAll();
		}


		const controller = new AbortController();
		this.pickerContainer.parentElement?.addEventListener('keydown', keypressHandler, { signal: controller.signal, capture: true });

		function keypressHandler(event: KeyboardEvent) {
			if (event.key === 'ArrowDown') {
				if (DatepickerPlugin.settings.focusOnArrowDown) {
					event.preventDefault();
					this.doc.getElementById('datepicker-input')?.focus();
					controller.abort();
				}
			}
			if (event.key === 'Escape') {
				this.escPressed = true;
				Datepicker.closeAll();
				controller.abort();
			}
		}

		this.pickerInput.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				if (this.pickerInput.value === '') {
					new Notice('Please enter a valid date');
				} else {

					this.onSubmit(this.pickerInput.value);
					// delay to allow editor to update on submit otherwise picker will immediately reopen
					setTimeout(() => {
						Datepicker.closeAll();
					}, 5);
				}

			}
			// Important: this will work only when the datepicker is in focus
			if (event.key === 'Escape') {
				this.escPressed = true;
				this.closeAll();
			}
		}, { capture: true });

		this.pickerInput.addEventListener('change', () => {
			this.pickerValue = this.pickerInput.value;
		});

		this.updatePosition(pos);

		// On mobile, the calendar doesn't show up the first time the input is touched,		
		// unless the element is focused, and focusing the element causes unintended closing
		// of keyboard, so I implement event listeners and prevent default behavior.
		if (Platform.isMobile) {
			this.pickerInput.addEventListener('touchstart', (e) => {
				e.preventDefault();
			})
			this.pickerInput.addEventListener('touchend', (e) => {
				e.preventDefault();
				(this.pickerInput as any).showPicker();
			});
		}

		if (DatepickerPlugin.settings.autofocus) this.pickerInput.focus();

		// delay is necessary because showing immediately doesn't show the calendar
		// in the correct position, maybe it shows the calendar before the dom is updated
		setTimeout(() => {
			if (DatepickerPlugin.settings.immediatelyShowCalendar)
				(this.pickerInput as any).showPicker();
		}, 20)

	}

}

class DatepickerSettingTab extends PluginSettingTab {
	plugin: DatepickerPlugin;

	constructor(app: App, plugin: DatepickerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl: settingsContainerElement } = this;

		settingsContainerElement.empty();

		new Setting(settingsContainerElement)
			.setName('Show a picker button for dates')
			.setDesc('Shows a button with a calendar icon associated with dates, select it to open the datepicker (Reloading Obsidian may be required)')
			.addToggle((toggle) => toggle
				.setValue(DatepickerPlugin.settings.showButtons)
				.onChange(async (value) => {
					DatepickerPlugin.settings.showButtons = value;
					await this.plugin.saveSettings();
				}));

		new Setting(settingsContainerElement)
			.setName('Show automatically')
			.setDesc('Datepicker will show automatically whenever a date value is selected')
			.addToggle((toggle) => toggle
				.setValue(DatepickerPlugin.settings.showAutomatically)
				.onChange(async (value) => {
					DatepickerPlugin.settings.showAutomatically = value;
					await this.plugin.saveSettings();
				}));


		new Setting(settingsContainerElement)
			.setName('Immediately show calendar')
			.setDesc('Immediately show the calendar when the datepicker opens')
			.addToggle((toggle) => toggle
				.setValue(DatepickerPlugin.settings.immediatelyShowCalendar)
				.onChange(async (value) => {
					DatepickerPlugin.settings.immediatelyShowCalendar = value;
					await this.plugin.saveSettings();
				}));

		new Setting(settingsContainerElement)
			.setName('Autofocus')
			.setDesc('Automatically focus the datepicker whenever the datepicker opens')
			.addToggle((toggle) => toggle
				.setValue(DatepickerPlugin.settings.autofocus)
				.onChange(async (value) => {
					DatepickerPlugin.settings.autofocus = value;
					await this.plugin.saveSettings();
				}));

		new Setting(settingsContainerElement)
			.setName('Focus on pressing down arrow')
			.setDesc('Focuses the datepicker when the down arrow is pressed')
			.addToggle((toggle) => toggle
				.setValue(DatepickerPlugin.settings.focusOnArrowDown)
				.onChange(async (value) => {
					DatepickerPlugin.settings.focusOnArrowDown = value;
					await this.plugin.saveSettings();
				}));

	}
}
