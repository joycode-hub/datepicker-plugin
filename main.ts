import { App, Editor, Plugin, PluginSettingTab, Setting, moment, Platform, Notice, setIcon, MomentFormatComponent } from 'obsidian';
import {
	ViewUpdate,
	PluginValue,
	EditorView,
	ViewPlugin,
	WidgetType,
	Decoration,
	DecorationSet
} from "@codemirror/view";
import { platform } from 'os';

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

	private get formats(): DateFormat[] {
		return this.getFormats();
	}


	private getFormats(): DateFormat[] {
		const formatPatterns = [
			'YYYY-MM-DD',
			'DD.MM.YYYY',
			'MM-DD-YYYY',
			'DD-MM-YYYY',
			'MM.DD.YYYY',
			'YYYY.MM.DD',
			'YYYY/MM/DD',
			'DD/MM/YYYY',
			'MM/DD/YYYY'
		];

		let formats: DateFormat[] = [];

		// Add user's preferred format first
		const userFormat = DatepickerPlugin.settings.dateFormat;
		const userSeparator = userFormat.includes('.') ? '\\.' : (userFormat.includes('/') ? '\\/' : '-');

		// Add datetime formats for all patterns
		formatPatterns.forEach(format => {
			const separator = format.includes('.') ? '\\.' : (format.includes('/') ? '\\/' : '-');
			formats.push(
				{
					regex: new RegExp(`\\d{1,4}${separator}\\d{1,2}${separator}\\d{1,4} \\d{1,2}:\\d{1,2}( )?([apm]{2})`, 'ig'),
					formatToUser: `${format} hh:mm A`,
					formatToPicker: "YYYY-MM-DDTHH:mm",
					type: 'DATETIME'
				},
				{
					regex: new RegExp(`\\d{1,4}${separator}\\d{1,2}${separator}\\d{1,4} \\d{1,2}:\\d{1,2}`, 'g'),
					formatToUser: `${format} HH:mm`,
					formatToPicker: "YYYY-MM-DDTHH:mm",
					type: 'DATETIME'
				},
				{
					regex: new RegExp(`\\d{1,4}${separator}\\d{1,2}${separator}\\d{1,4}`, 'g'),
					formatToUser: format,
					formatToPicker: "YYYY-MM-DD",
					type: 'DATE'
				}
			);
		});

		// Add time formats
		formats.push(
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
		);

		return formats;
	}


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

	private scrollEventAbortController = new AbortController();

	constructor(view: EditorView) {
		this.view = view;
		view.scrollDOM.addEventListener("scroll", this.datepickerScrollHandler.bind(this, view), { signal: this.scrollEventAbortController.signal });
		this.dates = this.getVisibleDates(view);
		this.decorations = pickerButtons(this.dates);
	}

	public datepicker: Datepicker | undefined = undefined;
	private previousDateMatch: DateMatch;
	dates: DateMatch[] = [];
	// flag to prevent repeatedly selecting text on every click of the datetime value, select only the first time
	private performedSelectText = false;

	public match: DateMatch | undefined;
	public performingReplace = false;

	openDatepicker(view: EditorView, match: DateMatch) {
		view.requestMeasure({
			read: view => {
				let pos = view.coordsAtPos(match.from);
				return pos;
			},
			write: pos => {
				if (!pos) {
					console.error("position is undefined");
					return;
				}

				this.datepicker = new Datepicker();
				this.datepicker.open(pos, match
					, (result) => {
						const resultFromPicker = moment(result);
						if (!resultFromPicker.isValid()) {
							return;
						}
						// Use the user's preferred format when editing dates
						const dateFromPicker = resultFromPicker.format(
							match.format.type === 'DATETIME'
								? (DatepickerPlugin.settings.overrideFormat 
									? DatepickerPlugin.settings.dateFormat + " " + (match.format.formatToUser.includes('A') ? 'hh:mm A' : 'HH:mm')
									: match.format.formatToUser)
								: match.format.type === 'DATE'
									? (DatepickerPlugin.settings.overrideFormat 
										? DatepickerPlugin.settings.dateFormat 
										: match.format.formatToUser)
									: match.format.formatToUser
						);
												
						if (dateFromPicker === match.value) return;
						this.performingReplace = true;
						setTimeout(() => { this.performingReplace = false; }, 300);
						let transaction = view.state.update({
							changes: {
								from: match.from,
								to: match.to,
								insert: dateFromPicker
							}
						});
						view.dispatch(transaction);

						if (this.match !== undefined && this.match.from !== match.from && DatepickerPlugin.settings.selectDateText) {
							const m = this.match;
							setTimeout(() => {
								view.dispatch({ selection: { anchor: m.from, head: m.to } })
							}, 0);
						}
					});
			}
		});
	}


	update(update: ViewUpdate) {

		this.view = update.view;

		if (update.docChanged || update.geometryChanged || update.viewportChanged || update.heightChanged || this.performingReplace) {
			this.datepickerPositionHandler();
			this.dates = this.getVisibleDates(update.view);
			this.decorations = pickerButtons(this.dates);
		}


		/*
		CM fires two update events for selection change,
		I use the code section below to ignore the second one
	*/
		if (update.docChanged === false &&
			update.state.selection.main.from === update.startState.selection.main.from &&
			update.state.selection.main.to === update.startState.selection.main.to
		) return;


		const { view } = update;

		const cursorPosition = view.state.selection.main.head;

		this.match = this.dates.find(date => date.from <= cursorPosition && date.to >= cursorPosition);
		if (this.match) {

			const { from } = update.state.selection.main;
			const { to } = update.state.selection.main;
			if (from !== to)// Closes datepicker if selection is a range and the range is not the entire matched datetime
				if (from !== this.match.from || to !== this.match.to) {
					if (this.datepicker !== undefined) this.datepicker.respectSettingAndClose();
					return;
				}

			let sameMatch = false;
			if (this.previousDateMatch !== undefined)
				sameMatch = this.previousDateMatch.from === this.match.from;

			if (this.datepicker !== undefined) {
				if (this.previousDateMatch !== undefined) {
					// prevent reopening date picker on the same date field when closed by button
					// or when esc was pressed
					if (sameMatch) {
						if (this.datepicker?.closedByButton || Datepicker.escPressed || Datepicker.enterPressed) return;
					} else {
						this.performedSelectText = false;//Allow possibly selecting datetime text again
						if (!Datepicker.openedByButton) {
							Datepicker.calendarImmediatelyShownOnce = false;//Allow possibly showing calendar automatically again
						} else Datepicker.openedByButton = false;
					}
				}
			} else this.performedSelectText = false;//Allow possibly selecting datetime text again
			if (DatepickerPlugin.settings.selectDateText && !this.performedSelectText && this.match !== undefined && (!update.docChanged || Datepicker.performedInsertCommand)) {
				setTimeout(() => view.dispatch({ selection: { anchor: this.match!.from, head: this.match!.to } }), 0);
				this.performedSelectText = true;
			}



			this.previousDateMatch = this.match;
			if (DatepickerPlugin.settings.showAutomatically) {
				// prevent reopening date picker on the same date field when just performed insert command
				if (Datepicker.performedInsertCommand) setTimeout(() => Datepicker.performedInsertCommand = false, 300);
				if (Datepicker.openedByButton) setTimeout(() => Datepicker.openedByButton = false, 300);
				if (!Datepicker.performedInsertCommand && !Datepicker.openedByButton && !this.performingReplace)
					setTimeout(() => this.openDatepicker(view, this.match!), 0);
			}
		} else {
			Datepicker.calendarImmediatelyShownOnce = false;
			this.performedSelectText = false;
			Datepicker.performedInsertCommand = false;
			if (this.datepicker !== undefined) {
				if (this.previousDateMatch !== undefined)
					if (cursorPosition < this.previousDateMatch.from || cursorPosition > this.previousDateMatch.to) {
						this.datepicker.respectSettingAndClose();
						this.datepicker = undefined;
					}
			}
		}


	}

	destroy() {
		this.datepicker?.respectSettingAndClose();
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

const pickerButtonsAbortController = new AbortController();
let dbounce = false;//debouncing is essential for button to work correctly on mobile
function datepickerButtonEventHandler(e: Event, view: EditorView) {
	if (dbounce) return;
	dbounce = true;
	setTimeout(() => dbounce = false, 100);
	let target = e.target as HTMLElement
	const dpCMPlugin = view.plugin(datepickerCMPlugin);
	if (!dpCMPlugin) return;
	if (target.matches(".datepicker-button, .datepicker-button *")) {
		e.preventDefault();
		const cursorPositionAtButton = view.posAtDOM(target);
		const dateMatch = dpCMPlugin!.dates.find(date => date.from === cursorPositionAtButton)!;
		// this toggles showing the datepicker if it is already open at the button position
		if (dpCMPlugin!.datepicker !== undefined && dpCMPlugin.datepicker.isOpened) {
			dpCMPlugin!.datepicker.respectSettingAndClose();
			dpCMPlugin!.datepicker.closedByButton = true; // to prevent picker from opening again on selecting same date field
		} else {
			dpCMPlugin!.datepicker?.respectSettingAndClose();
			Datepicker.openedByButton = true;
			Datepicker.calendarImmediatelyShownOnce = false;
			setTimeout(() => {
				if (DatepickerPlugin.settings.selectDateText) setTimeout(() => view.dispatch({ selection: { anchor: dateMatch.from, head: dateMatch.to } }), 0);
				dpCMPlugin!.openDatepicker(view, dateMatch);
			}, 0);
		}
	}
	return true;
}


interface DatepickerPluginSettings {
	dateFormat: string;
	overrideFormat: boolean;
	showDateButtons: boolean;
	showTimeButtons: boolean;
	showAutomatically: boolean;
	autoApplyEdits: boolean;
	immediatelyShowCalendar: boolean;
	autofocus: boolean;
	focusOnArrowDown: boolean;
	insertIn24HourFormat: boolean;
	selectDateText: boolean;
}

const DEFAULT_SETTINGS: DatepickerPluginSettings = {
	dateFormat: 'YYYY-MM-DD',
	overrideFormat: false,
	showDateButtons: true,
	showTimeButtons: true,
	showAutomatically: false,
	autoApplyEdits: true,
	immediatelyShowCalendar: false,
	autofocus: false,
	focusOnArrowDown: false,
	insertIn24HourFormat: false,
	selectDateText: false
}

export default class DatepickerPlugin extends Plugin {

	public static settings: DatepickerPluginSettings = DEFAULT_SETTINGS;

	async onload() {

		await this.loadSettings();

		this.registerEditorExtension(datepickerCMPlugin);

		this.addCommand({
			id: 'edit-datetime',
			name: 'Edit date/time',
			editorCallback: (editor: Editor) => {
				// @ts-expect-error, not typed
				const editorView = editor.cm as EditorView;
				const cursorPosition = editorView.state.selection.main.to;
				if (cursorPosition === undefined) {
					new Notice("Please select a date/time");
					return;
				}
				const plugin = editorView.plugin(datepickerCMPlugin);
				const match = plugin!.dates.find(date => date.from <= cursorPosition && date.to >= cursorPosition);
				if (match) {
					plugin!.openDatepicker(editorView, match);
				} else new Notice("Please select a date/time");
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
								Datepicker.performedInsertCommand = true;
								editorView.dispatch({
									changes: {
										from: cursorPosition,
										to: cursorPosition,
										insert: moment(result).format(DatepickerPlugin.settings.dateFormat)
									}
								});
							}, 0);
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
								Datepicker.performedInsertCommand = true;
								editorView.dispatch({
									changes: {
										from: cursorPosition,
										to: cursorPosition,
										insert: moment(result).format(timeFormat)
									}
								});
							}, 25);
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
						if (moment(result).isValid() === true) {
							let timeFormat: string;
							if (DatepickerPlugin.settings.insertIn24HourFormat) timeFormat = "HH:mm";
							else timeFormat = "hh:mm A";
							setTimeout(() => { // delay to wait for editor update to finish		
								Datepicker.performedInsertCommand = true;
								editorView.dispatch({
									changes: {
										from: cursorPosition,
										to: cursorPosition,
										insert: moment(result).format(DatepickerPlugin.settings.dateFormat + " " + timeFormat)
									}
								});
							}, 25);
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
						insert: moment().format(DatepickerPlugin.settings.dateFormat + " " + timeFormat)
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
						insert: moment().format(DatepickerPlugin.settings.dateFormat)
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
				if (match) {
					editorView.dispatch({
						selection: {
							anchor: match.from,
							head: match.from
						},
						scrollIntoView: true
					})
				} else new Notice("No next date/time found");
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
				if (match) {
					editorView.dispatch({
						selection: {
							anchor: match.from,
							head: match.from
						},
						scrollIntoView: true
					})
				} else new Notice("No previous date/time found");
			}
		});

		this.addSettingTab(new DatepickerSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (event) => {
				const editor = event?.view.app.workspace.activeEditor?.editor;
				if (!editor) return;
				// @ts-expect-error, not typed
				const editorView = editor.cm as EditorView;
				const dpCMPlugin = editorView.plugin(datepickerCMPlugin);
				if (!dpCMPlugin) return;
				let delay = 350;
				// if(dpCMPlugin.performingReplace) delay = 30;
				setTimeout(() => { // restores selection after replacing text on previuos date/time
					const { match } = dpCMPlugin;
					if (match !== undefined) {
						if (DatepickerPlugin.settings.selectDateText)
							editorView.dispatch({ selection: { anchor: match!.from, head: match!.to } })
						if (DatepickerPlugin.settings.showAutomatically)
							dpCMPlugin.openDatepicker(editorView, match);
					}
				}, delay);
				Datepicker.escPressed = false;
				Datepicker.calendarImmediatelyShownOnce = false;
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
	private submited = false;
	public isOpened = false;
	private pickerContainer: HTMLSpanElement;
	private pickerInput: HTMLInputElement;
	private viewContainer: HTMLElement;
	public datetime: DateMatch;
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
	public static enterPressed = false;

	constructor() {
		this.close();
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
		setTimeout(() => this.pickerInput.focus(), 250);
	}

	public close() {
		let datepickers = activeDocument.getElementsByClassName("datepicker-container");
		for (var i = 0; i < datepickers.length; i++) {
			datepickers[i].remove();
		}

		this.isOpened = false;

		// Simulate clicking the active tab header to regain focus
		setTimeout(() => {
			// Simulate Escape key press to restore focus
			const escapeEvent = new KeyboardEvent('keydown', {
				key: 'Escape',
				code: 'Escape',
				bubbles: true
			});
			activeDocument.dispatchEvent(escapeEvent);
		}, 50);
	}

	public respectSettingAndClose() {
		if (DatepickerPlugin.settings.autoApplyEdits) this.submitAndClose();
		else this.close();
	}

	private submitAndClose() {
		this.submit();
		this.close();
	}

	public submit() {
		if (this.submited || Datepicker.escPressed || !this.isOpened) return;
		this.submited = true;
		let submitValue = this.pickerInput.value;
		if (submitValue.length === 0) return;
		if (moment(submitValue).format(this.datetime.format.formatToUser) === this.datetime.value) return;
		if (this.datetime.format.type === "TIME")
			// Neccessary for momentjs to parse and format time
			submitValue = moment().format('YYYY-MM-DD') + "T" + this.pickerInput.value;

		setTimeout(() => this.onSubmit(submitValue), 0);
	}

	public open(pos: { top: number, left: number, right: number, bottom: number },
		datetime: DateMatch, onSubmit: (result: string) => void
	) {
		this.onSubmit = onSubmit;
		this.datetime = datetime;
		this.cursorPosition = datetime.from;
		this.closedByButton = false;
		Datepicker.escPressed = false;
		Datepicker.enterPressed = false;

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
		else if (datetime.format.type === "DATETIME") this.pickerInput.type = 'datetime-local';

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
		acceptButton.className = 'datepicker-container-button';
		setIcon(acceptButton, 'check');

		const buttonEventAbortController = new AbortController();
		const acceptButtonEventHandler = (event: Event) => {
			// event.preventDefault();
			if (this.pickerInput.value === '') {
				new Notice('Please enter a valid date');
			} else {
				Datepicker.enterPressed = true;
				this.submitAndClose();
				buttonEventAbortController.abort();
			}
		}
		acceptButton.addEventListener('click', acceptButtonEventHandler, { signal: buttonEventAbortController.signal });
		acceptButton.addEventListener('touchend', acceptButtonEventHandler, { signal: buttonEventAbortController.signal });

		const cancelButton = this.pickerContainer.createEl('button');
		cancelButton.className = 'datepicker-container-button';
		setIcon(cancelButton, 'x');
		function cancelButtonEventHandler(event: Event) {
			event.preventDefault();

			Datepicker.escPressed = true;
			this.close();
			buttonEventAbortController.abort();
		}

		cancelButton.addEventListener('click', cancelButtonEventHandler.bind(this), { signal: buttonEventAbortController.signal });
		cancelButton.addEventListener('touchend', cancelButtonEventHandler.bind(this), { signal: buttonEventAbortController.signal });


		const controller = new AbortController();
		const keypressHandler = (event: KeyboardEvent) => {
			if (event.key === 'ArrowDown') {
				if (DatepickerPlugin.settings.focusOnArrowDown) {
					event.preventDefault();
					this.focus();
					controller.abort();
				}
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				Datepicker.escPressed = true;
				this.close();
				controller.abort();
			}
		}
		this.pickerContainer.parentElement?.addEventListener('keydown', keypressHandler, { signal: controller.signal, capture: true });


		this.pickerInput.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				if (this.pickerInput.value === '') {
					new Notice('Please enter a valid date/time');
				} else {
					Datepicker.enterPressed = true;
					this.submitAndClose();
				}
			}
			// this works only when the datepicker is in focus
			if (event.key === 'Escape') {
				Datepicker.escPressed = true;
				this.close();
			}
		}, { capture: true });


		const blurEventHandler = () => {
			setTimeout(() => {
				if (!this.submited && !Datepicker.escPressed && !Datepicker.enterPressed && DatepickerPlugin.settings.autoApplyEdits)
					this.submit();
			}, 300);
		}
		this.pickerInput.addEventListener('blur', blurEventHandler,);

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

		if (DatepickerPlugin.settings.autofocus)
			if (!Platform.isMobile) this.focus();
			else if (!DatepickerPlugin.settings.immediatelyShowCalendar) this.focus();

		const click = new MouseEvent('click', {
			bubbles: true,
			cancelable: true,
			view: activeWindow
		});

		if (DatepickerPlugin.settings.immediatelyShowCalendar) {
			if (Datepicker.calendarImmediatelyShownOnce) return;
			if (Platform.isMobile) {
				this.pickerInput.focus();
				setTimeout(() => {
					this.pickerInput.dispatchEvent(click)
					Datepicker.calendarImmediatelyShownOnce = true;
				}, 150);
			} else {
				this.focus();

				// delay is necessary because showing immediately doesn't show the calendar
				// in the correct position, maybe it shows the calendar before the dom is updated
				setTimeout(() => {
					(this.pickerInput as any).showPicker();
					Datepicker.calendarImmediatelyShownOnce = true;
				}, 500);
			}
		}

		this.isOpened = true;
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
			.setName('Date Format')
			.setDesc('Choose your preferred date format for inserting new dates')
			.addDropdown(dropdown => dropdown
				.addOption('YYYY-MM-DD', 'YYYY-MM-DD')
				.addOption('DD.MM.YYYY', 'DD.MM.YYYY')
				.addOption('MM-DD-YYYY', 'MM-DD-YYYY')
				.addOption('DD-MM-YYYY', 'DD-MM-YYYY')
				.addOption('MM.DD.YYYY', 'MM.DD.YYYY')
				.addOption('YYYY.MM.DD', 'YYYY.MM.DD')
				.addOption('YYYY/MM/DD', 'YYYY/MM/DD')
				.addOption('DD/MM/YYYY', 'DD/MM/YYYY')
				.addOption('MM/DD/YYYY', 'MM/DD/YYYY')
				.setValue(DatepickerPlugin.settings.dateFormat)
				.onChange(async (value) => {
					DatepickerPlugin.settings.dateFormat = value;
					await this.plugin.saveSettings();
				}));

		new Setting(settingsContainerElement)
			.setName('Use date format when modifying existing dates')
			.setDesc('Use the selected date format when modifying existing dates')
			.addToggle((toggle) => toggle
				.setValue(DatepickerPlugin.settings.overrideFormat)
				.onChange(async (value) => {
					DatepickerPlugin.settings.overrideFormat = value;
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
			.setName('Auto apply edits')
			.setDesc('Will automatically apply edits made to the date when the datepicker closes or loses focus')
			.addToggle((toggle) => toggle
				.setValue(DatepickerPlugin.settings.autoApplyEdits)
				.onChange(async (value) => {
					DatepickerPlugin.settings.autoApplyEdits = value;
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
