import { Component, Input, OnInit, OnChanges, OnDestroy, ElementRef, NgZone,
         Output, EventEmitter, AfterViewChecked } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime} from 'rxjs/operators';
import { WindowService } from '../../lib/window.service';
import { LhcDataService} from '../../lib/lhc-data.service';

import LhcFormData from '../../lib/lforms/lhc-form-data';
import CommonUtils from "../../lib/lforms/lhc-common-utils.js";
import copy from "fast-copy";

declare var LForms: any;
declare var ResizeObserver;

@Component({
    selector: 'lhc-form',
    templateUrl: './lhc-form.component.html',
    styleUrls: ['./lhc-form.component.css'],
    providers: [WindowService, LhcDataService] // These two services are not provided in root.
    ,
    standalone: false
})
export class LhcFormComponent implements OnInit, OnChanges, OnDestroy, AfterViewChecked {

  @Input() questionnaire: any;
  @Input() options: any;
  @Input() prepop: boolean=false;
  @Input() fhirVersion: string;
  // contain the object of LhcFormData, could be used outside of the form component, formElement.lhcFormData
  @Input() lhcFormData: any; // not to publish
  // emit an event when the form's view and data are initially rendered
  @Output() onFormReady: EventEmitter<any> = new EventEmitter<any>();
  // emit an event when there are errors during the initialization and rendering.
  @Output() onError: EventEmitter<any> = new EventEmitter<any>();

  //lhcFormData: any;
  viewModeClass = "";
  viewMode = "";
  _inputFieldWidth = null

  private changeSize = new Subject();
  private observer: any;

  constructor(private winService: WindowService,
    public lhcDataService: LhcDataService,
    private host: ElementRef,
    private zone: NgZone) {

    this.changeSize
      .asObservable()
      .pipe(
        debounceTime(100)
      )
      .subscribe((eleWidth:number) => {
        this.winService.setWindowWidth(eleWidth);
    });

    winService.viewMode.subscribe(updatedMode => {
      this.viewModeClass = this.lhcDataService.getViewModeClass(updatedMode);
      this.viewMode = updatedMode;
    });

  }


  /**
   * Set up the observer on window size
   */
  ngOnInit(): void {
    this.observer = new ResizeObserver(entries => {
      this.zone.run(() => {
        let width = entries[0].contentRect.width;
        this.changeSize.next(width);
      });
    });
    this.observer.observe(this.host.nativeElement);
  }



  /**
   * Called after this component is rendered, but does not include child components.
   */
  // ngAfterViewInit(): void {
  //   Unfortunately, this.lhcFormData is not set yet when this is called.
  // }

  /**
   * Called after the view is completely checked, that is, after a form has
   * completely been rendered, and possibly at other times.
   */
  ngAfterViewChecked(): void {
    // If this is the first time this particular form has been rendered, see if
    // we should send the formReady event.
    if (this.lhcFormData && !this.lhcFormData._formRendered) {
      this.lhcFormData._formRendered = true;
      if (this.lhcFormData._formProcessed)
        this.formReady();
    }
  }


  /**
   * Remove the observer for window size
   */
  ngOnDestroy() {
    this.observer.unobserve(this.host.nativeElement);
  }


  /**
   *  Sets a flag that the form has been processed and checks whether the form
   *  is ready.
   */
  formProcessed() {
    this.lhcFormData._formProcessed = true;
    if (this.lhcFormData._formRendered)
      this.formReady();
  }



  /**
   * Set a flag and emit an event that the form is ready
   */
  formReady() {
    // set a flag on the form data
    // (lhc-autocomplete component depends on this flag to work correctly
    // with fhirpath expression triggered changes)
    this.lhcFormData._formReady = true;
    // emit an event when the data is initially loaded (if there are data to be loaded)
    // and the form's view is initially rendered
    this.onFormReady.emit();
  }


  /**
   * Handle the changes when a new form data is loaded
   * @param changes the object that contains the changes
   */
  ngOnChanges(changes) {
    // form data changes
    if (changes.questionnaire) {
      // form data changes, clean up the previous data before loading the new form data
      this.lhcFormData = null;
      this.lhcDataService.setLhcFormData(null);

      if (this.questionnaire) {
        const self = this;
        // reset the data after this thread is done
        setTimeout(()=> {
          try {
            let q = CommonUtils.deepCopy(self.questionnaire);
            // check if questionnaire is a FHIR Questionnaire
            if (q.resourceType === "Questionnaire") {
              let fhirVer = self.fhirVersion || LForms.Util.guessFHIRVersion(q) || "R4";
              if (LForms.FHIR[fhirVer] && LForms.FHIR[fhirVer].SDC) {
                // convert it to a lforms form data
                q = LForms.FHIR[fhirVer].SDC.convertQuestionnaireToLForms(q, self.options);
                // If options.questionnaireResponse is specified, we can utilize it and reduce the number of lforms API calls.
                if (self.options?.questionnaireResponse) {
                  // make a copy of questionnaireResponse so that the original data are not modified
                  let qr = copy(self.options.questionnaireResponse);
                  q = LForms.FHIR[fhirVer].SDC.mergeQuestionnaireResponseToLForms(q, qr);
                }
              }
            }
            self.lhcFormData = new LhcFormData(q);
            // and options change
            if (changes.options && self.options) {
              // self.lhcFormData.setTemplateOptions(CommonUtils.deepCopy(self.options));
              self.lhcFormData.setTemplateOptions(self.options);
            }
            self.lhcDataService.setLhcFormData(self.lhcFormData);
            // if FHIR libs are loaded and the data is converted from a FHIR Questionnaire
            if (LForms.FHIR && self.lhcFormData.fhirVersion) {
              self.lhcFormData.loadFHIRResources(self.prepop).then(()=> {
                // when a new form is loaded, run all FHIR Expressions including the initial expressions
                // self.lhcFormData sometimes is set to null to clear the page
                if (self.lhcFormData && (self.lhcFormData._hasResponsiveExpr || self.lhcFormData._hasInitialExpr)) {
                  self.lhcFormData._expressionProcessor.runCalculations(!self.lhcFormData.hasSavedData)
                    .then(() => {
                      self.lhcFormData._checkFormControls();
                      self.formProcessed();
                    })
                    .catch(error => {
                      const e = typeof error === "string" ? error : error.message
                      self.onError.emit([e])
                    });
                }
                else {
                  self.formProcessed();
                }
              })
              .catch(error => {
                // loadFHIRResources fails with an array of errors, but perhaps
                // something else has thrown an exception.
                const e = error.message ? [error.message] : error;
                self.onError.emit(e);
              });
            }
            else {
              self.formProcessed();
            }

          }
          catch (error) {
            const e = typeof error === "string" ? error : error.message
            self.onError.emit([e])
          };
        },1)
      }
      else {
        // clean up the previous data
        this.lhcFormData = null;
        this.lhcDataService.setLhcFormData(null);
      }
    }
    // only options changes
    else if (changes.options) {
      let lhcFD = this.lhcDataService.getLhcFormData();
      if (lhcFD) {
        lhcFD.setTemplateOptions(this.options);
      }
    }
  }

}
