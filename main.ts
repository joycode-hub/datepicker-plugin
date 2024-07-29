import { App, Editor, Plugin, PluginSettingTab, Setting, moment, Platform, Notice, setIcon } from 'obsidian';
import {
	ViewUpdate,
	PluginValue,
	EditorView,
	ViewPlugin,
	WidgetType,
	Decoration,
	DecorationSet
} from "@codemirror/view";

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
	type: 'DATE' | 'DATETIME' | 'TIME';
}
interface VisibleText {
	from: number;
	to: number;
	text: string;
}

class DateButtonWidget extends WidgetType {
	toDOM(): HTMLElement {
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
class TimeButtonWidget extends WidgetType {
	toDOM(): HTMLElement {
		const button = document.createElement('span');
		button.className = 'datepicker-button';
		setIcon(button, 'clock');
		return button;
	}
	ignoreEvent() { return false };
	eq(): boolean {
		return true;
	}
}

function pickerButtons(dateMatches: DateMatch[]) {
	const buttons = [];
	if (!DatepickerPlugin.settings.showDateButtons && !DatepickerPlugin.settings.showTimeButtons) return Decoration.set([]);

	for (const dateMatch of dateMatches) {
		if (DatepickerPlugin.settings.showDateButtons && (dateMatch.format.type === 'DATE' || dateMatch.format.type === 'DATETIME')) {
			let buttonDeco = Decoration.widget({
				widget: new DateButtonWidget(),
				side: -1
			})
			buttons.push(buttonDeco.range(dateMatch.from));
		} else
			if (DatepickerPlugin.settings.showTimeButtons && dateMatch.format.type === 'TIME') {
				let buttonDeco = Decoration.widget({
					widget: new TimeButtonWidget(),
					side: -1
				})
				buttons.push(buttonDeco.range(dateMatch.from));
			}
	}
	return Decoration.set(buttons, true);
}

class DatepickerCMPlugin implements PluginValue {

	private view: EditorView;

	datepickerPositionHandler() {
		if (this.datepicker === undefined) return;
		this.view.requestMeasure({
			read: state => {
				let pos = state.coordsAtPos(this.datepicker?.cursorPosition!);
				return pos;
			},
			write: pos => {
				if (pos) {
					this.datepicker!.updatePosition({
						top: pos!.top,
						left: pos!.left,
						bottom: pos!.bottom
					});
				}
			}
		});
	}
	datepickerScrollHandler = () => {
		this.datepickerPositionHandler();
	};

	private formats: DateFormat[] = [
		{
			regex: /\d{4}[-\/\\.]{1}\d{1,2}[-\/\\.]{1}\d{1,2}[ T]\d{1,2}:\d{1,2}( )?([apm]{2})/ig,
			formatToUser: "YYYY-MM-DD hh:mm A",
			formatToPicker: "YYYY-MM-DDTHH:mm",
			type: 'DATETIME'
		},
		{
			regex: /\d{4}[-\/\\.]{1}\d{1,2}[-\/\\.]{1}\d{1,2}[ T]\d{1,2}:\d{1,2}/g,
			formatToUser: "YYYY-MM-DD HH:mm",
			formatToPicker: "YYYY-MM-DDTHH:mm",
			type: 'DATETIME'
		},
		{
			regex: /\d{1,2}[-\/\\.]{1}\d{1,2}[-\/\\.]{1}\d{4} \d{1,2}:\d{1,2}( )?([apm]{2})/ig,
			formatToUser: "DD-MM-YYYY hh:mm A",
			formatToPicker: "YYYY-MM-DDTHH:mm",
			type: 'DATETIME'
		},
		{
			regex: /\d{1,2}[-\/\\.]{1}\d{4}[ T]\d{1,2}:\d{1,2}/g,
			formatToUser: "DD-MM-YYYY HH:mm",
			formatToPicker: "YYYY-MM-DDTHH:mm",
			type: 'DATETIME'
		},
		{
			regex: /\d{4}[-\/\\.]{1}\d{1,2}[-\/\\.]{1}\d{1,2}/g,
			formatToUser: "YYYY-MM-DD",
			formatToPicker: "YYYY-MM-DD",
			type: 'DATE'
		},
		{
			regex: /\d{1,2}[-\/\\.]{1}\d{1,2}[-\/\\.]{1}\d{4}/g,
			formatToUser: "DD-MM-YYYY",
			formatToPicker: "YYYY-MM-DD",
			type: 'DATE'
		},
		{
			regex: /\d{1,2}:\d{1,2}( )?([apm]{2})/ig,
			formatToUser: "hh:mm A",
			formatToPicker: "HH:mm",
			type: 'TIME'
		},
		{
			regex: /\d{1,2}:\d{1,2}/g,
			formatToUser: "HH:mm",
			formatToPicker: "HH:mm",
			type: 'TIME'
		}
	]

	private getVisibleDates(view: EditorView): DateMatch[] {
		let visibleText: VisibleText[] = [];
		visibleText = view.visibleRanges.map(r => { return { from: r.from, to: r.to, text: view.state.doc.sliceString(r.from, r.to) } });
		let matchingDate: RegExpExecArray | null;
		const dateMatches: DateMatch[] = [];

		for (const vt of visibleText) {
			if (vt.from >= view.viewport.from && vt.to <= view.viewport.to)
				for (const format of this.formats) {
					while ((matchingDate = format.regex.exec(vt.text ?? "")) !== null) {
						const matchingDateStart = matchingDate?.index! + vt.from;
						const matchingDateEnd = matchingDate?.index! + matchingDate![0].length + vt.from;
						/*
						 avoid pushing values that are part of another match to avoid recognizing values that are part of other values
						 as their own date/time, eg: the time portion of a date/time is not seperate from the date portion, two dates on
						 the same line with no space or seperation should not be recognized as several dates (this was a bug)
						 */
						if (dateMatches.some((m) => 
							matchingDateStart >= m.from && ((matchingDateEnd <= m.to) || (matchingDateStart <= m.to)))) continue;
						dateMatches.push({ from: matchingDate.index + vt.from, to: matchingDate.index + matchingDate[0].length + vt.from, value: matchingDate[0], format: format });
					}
				}
		}
		return dateMatches;
	}

	private getAllDates(view: EditorView): DateMatch[] {
		let matchingDate: RegExpExecArray | null;
		const dateMatches: DateMatch[] = [];
		const noteText = view.state.doc.toString();
		this.formats.forEach((format) => {
			while ((matchingDate = format.regex.exec(noteText)) !== null) {
				const matchingDateStart = matchingDate?.index!;
				const matchingDateEnd = matchingDate?.index! + matchingDate![0].length;
				if (dateMatches.some((m) => 
					matchingDateStart >= m.from && ((matchingDateEnd <= m.to) || (matchingDateStart <= m.to)))) continue;
		dateMatches.push({ from: matchingDate.index, to: matchingDate.index + matchingDate[0].length, value: matchingDate[0], format: format });
			}
		});
		return dateMatches;
	}

	public getNextMatch(view: EditorView, cursorPosition: number): DateMatch | undefined {
		const matches = this.getAllDates(view).sort((a, b) => a.from - b.from);
			return matches.find(m => m.from > cursorPosition);		
	}

	public getPreviousMatch(view: EditorView, cursorPosition: number): DateMatch | undefined {
		const matches = this.getAllDates(view).sort((a, b) => b.from - a.from);
		return matches.find(m => m.to < cursorPosition);
	}

	decorations: DecorationSet;

	private scrollEventAbortController: AbortController = new AbortController();

	constructor(view: EditorView) {
		this.view = view;
		view.scrollDOM.addEventListener("scroll", this.datepickerScrollHandler.bind(this, view), { signal: this.scrollEventAbortController.signal });
		this.dates = this.getVisibleDates(view);
		this.decorations = pickerButtons(this.dates);
	}

	public datepicker: Datepicker | undefined = undefined;
	private previousDateMatch: DateMatch;
	dates: DateMatch[] = [];

	private performedSelectText = false;// flag to prevent repeatedly selecting text

	openDatepicker(view: EditorView, match: DateMatch) {
		view.requestMeasure({
			read: view => {
				let pos = view.coordsAtPos(match.from);
				return pos;
			},
			write: pos => {
				if (!pos) return;
				this.datepicker = new Datepicker();
				this.datepicker.open(pos, match
					, (result) => {
						const resultFromPicker = moment(result);
						if (!resultFromPicker.isValid()) {
							return;
						}
						const dateFromPicker = resultFromPicker.format(match.format.formatToUser);
						if (dateFromPicker === match.value) return;
						let transaction = view.state.update({
							changes: {
								from: match.from,
								to: match.to,
								insert: dateFromPicker
							},
						});
						view.dispatch(transaction);
					});
			}
		});
	}

	private updateTimer = false;
	update(update: ViewUpdate) {

		this.view = update.view;

		if (update.docChanged || update.geometryChanged || update.viewportChanged || update.heightChanged) {
			this.datepickerPositionHandler();
			this.dates = this.getVisibleDates(update.view);
			this.decorations = pickerButtons(this.dates);
		}


		/*
		CM fires two update events for selection change,
		I use the below code section to ignore the second one
		otherwise the datepicker flashes as it closes and reopens
	*/
		if (update.docChanged === false &&
			update.state.selection.main.from === update.startState.selection.main.from &&
			update.state.selection.main.to === update.startState.selection.main.to
		) return;

		// skip redundant updates,
		// saves performance and mitigates some bugs
		if (this.updateTimer) return;
		this.updateTimer = true;
		setTimeout(() => this.updateTimer = false, 300);

		const { view } = update;

		const cursorPosition = view.state.selection.main.head;

		const match = this.dates.find(date => date.from <= cursorPosition && date.to >= cursorPosition);
		if (match) {

			const { from } = update.state.selection.main;
			const { to } = update.state.selection.main;
			if (from !== to)
				if (from !== match.from || to !== match.to) {
					Datepicker.closeAll();
					return;
				}

			if (this.datepicker !== undefined) {
				if (this.previousDateMatch !== undefined) {
					// prevent reopening date picker on the same date field when closed by button
					// or when esc was pressed
					if (this.previousDateMatch === match) {
						if (this.datepicker?.closedByButton || Datepicker.escPressed) return;
					} else {
						this.performedSelectText = false;
						if (!Datepicker.openedByButton) {
							Datepicker.calendarImmediatelyShownOnce = false;
						} else Datepicker.openedByButton = false;
					}
				}
			} else this.performedSelectText = false;

			if (DatepickerPlugin.settings.selectDateText && !this.performedSelectText && (!update.docChanged || Datepicker.performedInsertCommand)) {
				this.performedSelectText = true;
				setTimeout(() => view.dispatch({ selection: { anchor: match.from, head: match.to } }), 650);
			}

			this.previousDateMatch = match;
			if (DatepickerPlugin.settings.showAutomatically)
				// prevent reopening date picker on the same date field when just performed insert command
				if (Datepicker.performedInsertCommand) Datepicker.performedInsertCommand = false;
				else
					// delay is to allow app dom to update between active leaf switching, otherwise datepicker doesn't open on first click in a different leaf
					setTimeout(() => {
						this.datepicker?.closeAll();
						this.openDatepicker(view, match)
					}
						, 100);
		} else {
			Datepicker.calendarImmediatelyShownOnce = false;
			this.performedSelectText = false;
			if (this.datepicker !== undefined) {
				this.datepicker.closeAll();
				this.datepicker = undefined;
			}
		}
	}

	destroy() {
		Datepicker.closeAll();
		this.scrollEventAbortController.abort();
	}
}
export const datepickerCMPlugin = ViewPlugin.fromClass(DatepickerCMPlugin, {
	decorations: (v) => {
		return v.decorations;
	},

	eventHandlers: {
		mousedown: (e, view) => {
			datepickerButtonEventHandler(e, view);
		},
		touchend: (e, view) => {
			datepickerButtonEventHandler(e, view);
		},
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
			setTimeout(() => {// delay to wait for editor selection update to finish, otherwise
				// datepicker flashes and reopens in previous/wrong position
				Datepicker.openedByButton = true;
				Datepicker.calendarImmediatelyShownOnce = false;
				const dateMatch = dpCMPlugin!.dates.find(
					date => date.from <= cursorPositionAtButton && date.to >= cursorPositionAtButton)!
				if (DatepickerPlugin.settings.selectDateText) setTimeout(() => view.dispatch({ selection: { anchor: dateMatch.from, head: dateMatch.to } }), 100);
				dpCMPlugin!.openDatepicker(view,
					dateMatch
					,);
			}, 250);
		}
	}
}

interface DatepickerPluginSettings {
	showDateButtons: boolean;
	showTimeButtons: boolean;
	showAutomatically: boolean;
	immediatelyShowCalendar: boolean;
	autofocus: boolean;
	focusOnArrowDown: boolean;
	insertIn24HourFormat: boolean;
	selectDateText: boolean;
}

const DEFAULT_SETTINGS: DatepickerPluginSettings = {
	showDateButtons: true,
	showTimeButtons: true,
	showAutomatically: false,
	immediatelyShowCalendar: false,
	autofocus: false,
	focusOnArrowDown: false,
	insertIn24HourFormat: false
	, selectDateText: false
}

export default class DatepickerPlugin extends Plugin {

	public static settings: DatepickerPluginSettings = DEFAULT_SETTINGS;

	async onload() {

		await this.loadSettings();

		this.registerEditorExtension(datepickerCMPlugin);

		this.addCommand({
			id: 'edit-date',
			name: 'Edit date',
			editorCallback: (editor: Editor) => {
				// @ts-expect-error, not typed
				const editorView = editor.cm as EditorView;
				const cursorPosition = editorView.state.selection.main.to;
				if (cursorPosition === undefined) {
					new Notice("Please select a date");
					return;
				}
				const plugin = editorView.plugin(datepickerCMPlugin);
				const match = plugin!.dates.find(date => date.from <= cursorPosition && date.to >= cursorPosition);
				if (match) {
					plugin!.openDatepicker(editorView, match);
				} else new Notice("Please select a date");
			}
		})

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
				const dateFormat: DateFormat = { regex: new RegExp(""), type: "DATE", formatToUser: "", formatToPicker: "" }
				const dateType: DateMatch = { from: cursorPosition, to: cursorPosition, value: "", format: dateFormat };
				datepicker.open(
					{ top: pos.top, left: pos.left, right: pos.right, bottom: pos.bottom }, dateType,
					(result) => {
						if (moment(result).isValid() === true) {
							setTimeout(() => { // delay to wait for editor update to finish
								editorView.dispatch({
									changes: {
										from: cursorPosition,
										to: cursorPosition,
										insert: moment(result).format("YYYY-MM-DD")
									}
								})
							}, 250);
							Datepicker.performedInsertCommand = true;
							datepicker.closeAll();
						} else new Notice("Please enter a valid date");
					}
				)
				datepicker.focus();
			}
		});
		this.addCommand({
			id: 'insert-time',
			name: 'Insert new time',
			editorCallback: (editor: Editor) => {
				// @ts-expect-error, not typed
				const editorView = editor.cm as EditorView;
				const cursorPosition = editorView.state.selection.main.to;
				if (cursorPosition === undefined) return;
				const pos = editorView.coordsAtPos(cursorPosition);
				if (!pos) return;
				const datepicker = new Datepicker()
				const dateFormat: DateFormat = { regex: new RegExp(""), type: "TIME", formatToUser: "", formatToPicker: "" }
				const dateType: DateMatch = { from: cursorPosition, to: cursorPosition, value: "", format: dateFormat };
				datepicker.open(
					{ top: pos.top, left: pos.left, right: pos.right, bottom: pos.bottom }, dateType,
					(result) => {
						if (moment(result, "HH:mm").isValid() === true) {
							let timeFormat: string;
							if (DatepickerPlugin.settings.insertIn24HourFormat) timeFormat = "HH:mm";
							else timeFormat = "hh:mm A";
							setTimeout(() => { // delay to wait for editor update to finish
								editorView.dispatch({
									changes: {
										from: cursorPosition,
										to: cursorPosition,
										insert: moment(result, "HH:mm").format(timeFormat)
									}
								})
							}, 250);
							Datepicker.performedInsertCommand = true;
							datepicker.closeAll();
						} else new Notice("Please enter a valid time");
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
				const dateFormat: DateFormat = { regex: new RegExp(""), type: "DATETIME", formatToUser: "", formatToPicker: "" }
				const dateType: DateMatch = { from: cursorPosition, to: cursorPosition, value: "", format: dateFormat };
				datepicker.open(
					{ top: pos.top, left: pos.left, right: pos.right, bottom: pos.bottom }, dateType,
					(result) => {
						// TODO: format time according to picker local format
						if (moment(result).isValid() === true) {
							let timeFormat: string;
							if (DatepickerPlugin.settings.insertIn24HourFormat) timeFormat = "HH:mm";
							else timeFormat = "hh:mm A";
							setTimeout(() => { // delay to wait for editor update to finish								
								editorView.dispatch({
									changes: {
										from: cursorPosition,
										to: cursorPosition,
										insert: moment(result).format("YYYY-MM-DD" + " " + timeFormat)
									}
								})
							}, 250);
							Datepicker.performedInsertCommand = true;
							datepicker.closeAll();
						} else new Notice("Please enter a valid date and time");
					}
				)
				datepicker.focus();
			}
		});
		this.addCommand({
			id: 'insert-current-time',
			name: 'Insert current time',
			editorCallback: (editor: Editor) => {
				// @ts-expect-error, not typed
				const editorView = editor.cm as EditorView;
				const cursorPosition = editorView.state.selection.main.to;
				if (cursorPosition === undefined) return;
				let timeFormat: string;
				if (DatepickerPlugin.settings.insertIn24HourFormat) timeFormat = "HH:mm";
				else timeFormat = "hh:mm A";
				Datepicker.performedInsertCommand = true;
				editorView.dispatch({
					changes: {
						from: cursorPosition,
						to: cursorPosition,
						insert: moment().format(timeFormat)
					}
				})
			}
		});

		this.addCommand({
			id: 'insert-current-datetime',
			name: 'Insert current date and time',
			editorCallback: (editor: Editor) => {
				// @ts-expect-error, not typed
				const editorView = editor.cm as EditorView;
				const cursorPosition = editorView.state.selection.main.to;
				if (cursorPosition === undefined) return;
				let timeFormat: string;
				if (DatepickerPlugin.settings.insertIn24HourFormat) timeFormat = "HH:mm";
				else timeFormat = "hh:mm A";
				Datepicker.performedInsertCommand = true;
				editorView.dispatch({
					changes: {
						from: cursorPosition,
						to: cursorPosition,
						insert: moment().format("YYYY-MM-DD" + " " + timeFormat)
					}
				})
			}
		});

		this.addCommand({
			id: 'insert-current-date',
			name: 'Insert current date',
			editorCallback: (editor: Editor) => {
				// @ts-expect-error, not typed
				const editorView = editor.cm as EditorView;
				const cursorPosition = editorView.state.selection.main.to;
				if (cursorPosition === undefined) return;
				Datepicker.performedInsertCommand = true;
				editorView.dispatch({
					changes: {
						from: cursorPosition,
						to: cursorPosition,
						insert: moment().format("YYYY-MM-DD")
					}
				})
			}
		});

		this.addCommand({
			id: 'select-next-datetime',
			name: 'Select next date/time',
			editorCallback: (editor: Editor) => {
				// @ts-expect-error, not typed
				const editorView = editor.cm as EditorView;
				const cursorPosition = editorView.state.selection.main.to;
				if (cursorPosition === undefined) return;
				const dpCMPlugin = editorView.plugin(datepickerCMPlugin);
				if (!dpCMPlugin) return;
				const match = dpCMPlugin.getNextMatch(editorView, cursorPosition);
				if(match){
				editorView.dispatch({
					selection: {
						anchor: match.from,
						head: match.from						
					},
					scrollIntoView: true
				})
				}else new Notice("No next date/time found");
			}
		});

		this.addCommand({
			id: 'select-previous-datetime',
			name: 'Select previous date/time',
			editorCallback: (editor: Editor) => {
				// @ts-expect-error, not typed
				const editorView = editor.cm as EditorView;
				const cursorPosition = editorView.state.selection.main.to;
				if (cursorPosition === undefined) return;
				const dpCMPlugin = editorView.plugin(datepickerCMPlugin);
				if (!dpCMPlugin) return;
				const match = dpCMPlugin.getPreviousMatch(editorView, cursorPosition);
				if(match){
				editorView.dispatch({
					selection: {
						anchor: match.from,
						head: match.from						
					},
					scrollIntoView: true
				})
				}else new Notice("No previous date/time found");
			}
		});

		this.addSettingTab(new DatepickerSettingTab(this.app, this));
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				Datepicker.escPressed = false;
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
	}

}

class Datepicker {

	private onSubmit: (result: string) => void;
	public static isOpened = false;
	private pickerContainer: HTMLSpanElement;
	private pickerInput: HTMLInputElement;
	private viewContainer: HTMLElement;
	private datetime: DateMatch;
	public static escPressed = false;
	public cursorPosition: number;
	public closedByButton = false;
	public static openedByButton = false;
	// prevents reopening the datepicker on the just inserted date
	public static performedInsertCommand = false;
	// Used for preventing the calendar from continuously reopening on every
	// interaction with the datefield when set to immediatelyShowCalendar
	public static calendarImmediatelyShownOnce = false;
	// Used for preventing blur event from inserting date twice
	private enterPressed = false;

	constructor() {
		this.closeAll();
	}


	public updatePosition(pos: { top: number, left: number, bottom: number }) {
		// TODO: add support for rtl windows: pseudo:if(window.rtl)
		const left = pos.left - this.viewContainer.getBoundingClientRect().left;
		if (left + this.pickerContainer.offsetWidth > this.viewContainer.offsetWidth)
			this.pickerContainer.style.left = left - ((left + this.pickerContainer.offsetWidth) - this.viewContainer.offsetWidth) + 'px';
		else this.pickerContainer.style.left = left + 'px';

		const leafTop = this.viewContainer.closest('.workspace-leaf-content')!.getBoundingClientRect().top;
		if (pos.bottom - leafTop > this.viewContainer.offsetHeight)
			this.pickerContainer.style.top = pos.top - leafTop - this.pickerContainer.offsetHeight + 'px';
		else this.pickerContainer.style.top = pos.bottom - leafTop + 'px';
	}

	public focus() {
		activeDocument.getElementById('datepicker-input')?.focus();
	}

	public static closeAll() {
		Datepicker.isOpened = false;
		let datepickers = activeDocument.getElementsByClassName("datepicker-container");
		for (var i = 0; i < datepickers.length; i++) {
			datepickers[i].remove();
		}
	}
	public closeAll() {
		if (Platform.isMobile) {// datepicker mobile doesn't use focus and blur events, so I save on close
			setTimeout(() => {
				if (!Datepicker.escPressed && !this.enterPressed)
					this.submit();
			}, 50);
		}
		Datepicker.closeAll();
	}

	private submit() {
		let submitValue = this.pickerInput.value;
		if (submitValue.length === 0) return;
		if (this.onSubmit !== undefined)
			if (this.datetime.format.type === "TIME")
				// Neccessary for momentjs to parse and format time
				submitValue = "1970-01-01" + " " + this.pickerInput.value;
		this.onSubmit(submitValue);
	}

	public open(pos: { top: number, left: number, right: number, bottom: number },
		datetime: DateMatch, onSubmit: (result: string) => void
	) {
		this.onSubmit = onSubmit;
		this.datetime = datetime;
		this.cursorPosition = datetime.from;
		Datepicker.isOpened = true;
		this.closedByButton = false;
		Datepicker.escPressed = false;

		this.viewContainer = activeDocument.querySelector('.workspace-leaf.mod-active')?.querySelector('.cm-editor')!;
		if (!this.viewContainer) {
			console.error("Could not find view container");
			return;
		}
		this.pickerContainer = this.viewContainer.createEl('div');
		this.pickerContainer.className = 'datepicker-container';
		this.pickerContainer.id = 'datepicker-container';
		this.pickerInput = this.pickerContainer.createEl('input');

		if (datetime.format.type === "TIME") this.pickerInput.type = 'time';
		else if (datetime.format.type === "DATE") this.pickerInput.type = 'date';
		else this.pickerInput.type = 'datetime-local';

		this.pickerInput.id = 'datepicker-input';
		this.pickerInput.className = 'datepicker-input';

		this.pickerInput.value = moment(datetime.value, [
			"YYYY-MM-DD hh:mm A"
			, "YYYY-MM-DDThh:mm"
			, "YYYY-MM-DD hh:mma"
			, "YYYY.MM.DD HH:mm"
			, "YYYY-MM-DD"
			, "DD-MM-YYYY HH:mm"
			, "DD-MM-YYYY hh:mm A"
			, "DD-MM-YYYY hh:mma"
			, "DD-MM-YYYY"
			, "hh:mm A"
			, "HH:mm"
		], false).format(datetime.format.formatToPicker);

		const acceptButton = this.pickerContainer.createEl('button');
		acceptButton.className = 'datepicker-widget-button';
		setIcon(acceptButton, 'check');
		const buttonEventAbortController = new AbortController();
		const acceptButtonEventHandler = (event: Event) => {
			event.preventDefault();

			if (this.pickerInput.value === '') {
				new Notice('Please enter a valid date');
			} else {
				this.enterPressed = true;
				this.submit();
				buttonEventAbortController.abort();
					Datepicker.closeAll();
			}
		}
		acceptButton.addEventListener('click', acceptButtonEventHandler, { signal: buttonEventAbortController.signal });
		acceptButton.addEventListener('touchend', acceptButtonEventHandler, { signal: buttonEventAbortController.signal });

		const cancelButton = this.pickerContainer.createEl('button');
		cancelButton.className = 'datepicker-widget-button';
		setIcon(cancelButton, 'x');
		function cancelButtonEventHandler(event: Event) {
			event.preventDefault();
			Datepicker.escPressed = true;
			Datepicker.closeAll();
			buttonEventAbortController.abort();
		}

		cancelButton.addEventListener('click', cancelButtonEventHandler.bind(this), { signal: buttonEventAbortController.signal });
		cancelButton.addEventListener('touchend', cancelButtonEventHandler.bind(this), { signal: buttonEventAbortController.signal });


		const controller = new AbortController();
		const keypressHandler = (event: KeyboardEvent) => {
			if (event.key === 'ArrowDown') {
				if (DatepickerPlugin.settings.focusOnArrowDown) {
					event.preventDefault();
					activeDocument.getElementById('datepicker-input')?.focus();
					controller.abort();
				}
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				Datepicker.escPressed = true;
				Datepicker.closeAll();
				controller.abort();
			}
		}
		this.pickerContainer.parentElement?.addEventListener('keydown', keypressHandler, { signal: controller.signal, capture: true });


		this.pickerInput.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				if (this.pickerInput.value === '') {
					new Notice('Please enter a valid date/time');
				} else {
					this.enterPressed = true;
					this.submit();
						Datepicker.closeAll();
				}
			}
			// this works only when the datepicker is in focus
			if (event.key === 'Escape') {
				Datepicker.escPressed = true;
				this.closeAll();
			}
		}, { capture: true });


		const blurEventHandler = () => {
			setTimeout(() => {
				if (!Datepicker.escPressed && !this.enterPressed)
					this.submit();
			}, 600);
		}
		this.pickerInput.addEventListener('blur', blurEventHandler);

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

		if (DatepickerPlugin.settings.immediatelyShowCalendar) {
			if (Datepicker.calendarImmediatelyShownOnce) return;
			// delay is necessary because showing immediately doesn't show the calendar
			// in the correct position, maybe it shows the calendar before the dom is updated
			setTimeout(() => {
				if (Datepicker.isOpened)
					(this.pickerInput as any).showPicker();
				Datepicker.calendarImmediatelyShownOnce = true;
			}, 150);

		}

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
			.setDesc('Shows a button with a calendar icon associated with date values, select it to open the picker (Reloading Obsidian may be required)')
			.addToggle((toggle) => toggle
				.setValue(DatepickerPlugin.settings.showDateButtons)
				.onChange(async (value) => {
					DatepickerPlugin.settings.showDateButtons = value;
					await this.plugin.saveSettings();
				}));

		new Setting(settingsContainerElement)
			.setName('Show a picker button for times')
			.setDesc('Shows a button with a clock icon associated with time values, select it to open the picker (Reloading Obsidian may be required)')
			.addToggle((toggle) => toggle
				.setValue(DatepickerPlugin.settings.showTimeButtons)
				.onChange(async (value) => {
					DatepickerPlugin.settings.showTimeButtons = value;
					await this.plugin.saveSettings();
				}));

		new Setting(settingsContainerElement)
			.setName('Show automatically')
			.setDesc('Datepicker will show automatically whenever a date/time value is selected')
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
			.setName('Focus on pressing down arrow key')
			.setDesc('Focuses the datepicker when the down arrow keyboard key is pressed')
			.addToggle((toggle) => toggle
				.setValue(DatepickerPlugin.settings.focusOnArrowDown)
				.onChange(async (value) => {
					DatepickerPlugin.settings.focusOnArrowDown = value;
					await this.plugin.saveSettings();
				}));

		new Setting(settingsContainerElement)
			.setName('Insert new time in 24 hour format')
			.setDesc('Insert time in 24 hour format when performing "Insert new time" and "Insert new date and time" commands')
			.addToggle((toggle) => toggle
				.setValue(DatepickerPlugin.settings.insertIn24HourFormat)
				.onChange(async (value) => {
					DatepickerPlugin.settings.insertIn24HourFormat = value;
					await this.plugin.saveSettings();
				}));

		new Setting(settingsContainerElement)
			.setName('Select date/time text')
			.setDesc('Automatically select the entire date/time text when a date/time is selected')
			.addToggle((toggle) => toggle
				.setValue(DatepickerPlugin.settings.selectDateText)
				.onChange(async (value) => {
					DatepickerPlugin.settings.selectDateText = value;
					await this.plugin.saveSettings();
				}));


	}
}
