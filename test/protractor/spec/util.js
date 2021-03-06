// Helper functions for the tests
const EC = protractor.ExpectedConditions;

var util = {
  /**
   *  Returns a function that returns a promise for the given element.
   * @param elemLoc either a string for the ID of an element or a protractor
   *  locator.
   */
  elementFactory: function (elemLoc) {
    if (typeof elemLoc === 'string')
      elemLoc = by.id(elemLoc);
    return function () {
      return element(elemLoc);
    }
  },


  /**
   *  Waits for a field to have the given value.
   * @param field a protractor element locator (e.g. returned by $)
   * @param value the value to wait for
   * @return a promise that resolves when the field has the expected value.
   */
  waitForValue: function (field, value) {
    return browser.wait(function() {
      return field.getAttribute('value').then(function(val) {
        return val === value;
      })
    }, 5000);// Debugging: .then(function() {console.log("got "+value)}, function() {console.log("didn't get "+value)});
  },


  /**
   *  The selenium sendKeys function sends events for each character and the
   *  result is not stable, so we use this instead.  Only the key events for the
   *  last character are sent.
   * @param field a protractor element locator (e.g. returned by $)
   * @param str the value (either a string or a number)
   * @return a promise that resolves when str has been added to the field value
   */
  sendKeys: function(field, str) {
    str = '' + str; // convert numbers to strings
    return field.getAttribute('value').then(function(oldVal) {
      var allButLastChar = oldVal+str.slice(0,-1);
      browser.executeScript('arguments[0].value = "'+allButLastChar+'"',
        field.getWebElement()).then(function success() {
          util.waitForValue(field, allButLastChar);
          field.sendKeys(str.slice(-1));
          return util.waitForValue(field, oldVal+str);
        }, function rejected() {
          // For type=file, you can't set the value programmatically.  I think
          // protractor does something special.  Also, the value starts with
          // something like C:\fakepath for reason, so just let
          // protractor handle it.
          return field.sendKeys(str);
        });
      });
  },


  /**
   *  The selenium clearField function does not wait for the field to be cleared
   *  before the next field runs (https://stackoverflow.com/a/43616117) so we
   *  use this instead.
   * @param field a protractor element locator (e.g. returned by $)
   * @return a promise that resolves when the field is empty
   */
  clearField: function(field) {
    field.clear();
    return this.waitForValue(field, '');
  },


  /**
   *  Erases the value in the given field.  Leaves the focus in the
   *  field afterward (unlike clearField, which uses the protractor API which
   *  does something to the focus.
   * @param field a protractor element locator (e.g. returned by $)
   * @return a promise that resolves when the field is empty
   */
  eraseField: function(field) {
    field.click();
    field.sendKeys(protractor.Key.CONTROL, 'a'); // select all
    field.sendKeys(protractor.Key.BACK_SPACE); // clear the field
    return this.waitForValue(field, '');
  },


  /**
   *  Returns a promise that resolves when scrolling has stopped.
   */
  waitForScrollStop: function() {
    return browser.executeScript("return window.scrollY").then(originalScrollY => {
      // Sleep to let some scrolling happen, if it is going to.
      return browser.sleep(100).then(() =>
        browser.executeScript("return window.scrollY").then(newScrollY => {
          console.log("originalScrollY="+originalScrollY+"; newScrollY="+newScrollY);
          return (originalScrollY == newScrollY) ? true : util.waitForScrollStop()
        })
      );
    });
  },


  /**
   * Scrolls an element's parent container such that the element is visible to the user
   * @param {ElementFinder} elementFinder - protractor object to represent the element
   * @return {Promise}
   */
  scrollIntoView: function (elementFinder) {
    // console.log("scrollInfoView called for "+elementFinder.locator().value);
    return elementFinder.getWebElement().then((element) => {
      return browser.executeScript(function (element) {
        if (element.scrollIntoViewIfNeeded) {
          element.scrollIntoViewIfNeeded(true);
        } else {
          element.scrollIntoView({block: 'center'});
        }
      }, element).then(
        () => util.waitForScrollStop()
      );
    });
  },


  /**
   * Scrolls an element into view and clicks on it when it becomes clickable
   * @param {ElementFinder} elementFinder - protractor object to represent the element
   * @return {Promise}
   */
  safeClick: function (elementFinder) {
    // Borrowed Yury's code from fhir-obs-viewer.
    return browser.wait(EC.elementToBeClickable(elementFinder), 5000).then(()=>
      this.scrollIntoView(elementFinder).then(() => {
        console.log("Clicking "+elementFinder.locator().value);
        return elementFinder.click()
      })
    );
    // For when debugging is needed.
    /*
    return browser.wait(EC.presenceOf(elementFinder)).then(() => {
      console.log("%%% safeClick:  element present");
      return browser.wait(()=>elementFinder.isDisplayed()).then(() => {
      //return browser.wait(EC.visibilityOf(elementFinder)).then(() => {
        console.log("%%% safeClick:  element visible");
        return this.scrollIntoView(elementFinder).then(() => elementFinder.click());
      });
    });
    */
  },


  /**
   *  For fields with an autocomplete-lhc list, this returns a promise that
   *  resolves to the number items in the list.  (For other fields, it will
   *  resolve to zero.)
   * @param field the element finder for the field.
   */
  fieldListLength: function(field) {
    return browser.executeScript(function(htmlField) {
      let size = 0;
      let autocomp = htmlField.autocomp;
      if (autocomp) {
        let rawList = autocomp.rawList_;
        if (rawList)
          size = rawList.length;
      }
      return size;
    }, field.getWebElement());
  },


  /**
   *  For fields with an autocomplete-lhc list, this returns a promise that
   *  resolved to a boolean indicating whether the field has a list of a at
   *  least one item.
   * @param field the element finder for the field.
   */
  fieldHasList: function(field) {
    return this.fieldListLength(field).then((length)=>{
      return length > 0;
    });
  },


   /**
   *  Clicks the given add/remove repeating item button, and sleeps a bit to let the page stop moving.
   */
  clickAddRemoveButton: function (button) {
    browser.executeScript('arguments[0].scrollIntoView({behavior: "instant"})',
      button.getWebElement());
    browser.sleep(300); // allow page to scroll or adjust
    button.click();
    browser.sleep(300); // allow page to scroll or adjust
  },

  /**
   *  Waits for the given element to be present on the page.
   */
  waitForElementPresent: function(elem) {
    browser.wait(function(){return browser.isElementPresent(elem)}, 30000);
  },

  /**
   *  Waits for the given element to not be present on the page.
   */
  waitForElementNotPresent: function(elem) {
    var EC = protractor.ExpectedConditions;
    browser.wait(function(){return EC.not(browser.isElementPresent(elem))}, 3000);
  },

  /**
   *  Waits for the given element to be displayed on the page.
   */
  waitForElementDisplayed: function(elem) {
    // Make sure it is displayed first.
    util.waitForElementPresent(elem);
    browser.wait(function(){return elem.isDisplayed()}, 3000);
  },

  /**
   *  Disables Autocompleter scrolling (by making the move immediate).
   */
  disableAutocompleterScroll: function() {
    let origStart = LForms.Def.Effect.Base.prototype.start;
    LForms.Def.Effect.Scroll.prototype.start = function(options) {
      options.duration = 0;
      origStart.call(this, options);
    }
  },

  /**
   *  Disables CSS animation.
   */
  disableCssAnimate: function() {
    var style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = '* {' +
      '-webkit-transition: none !important;' +
      '-moz-transition: none !important;' +
      '-o-transition: none !important;' +
      '-ms-transition: none !important;' +
      'transition: none !important;'
      '}';
    document.getElementsByTagName('head')[0].appendChild(style);
  },

  /**
   * Get the datetime string in DTM picker's default format for the current time with the given offset.
   * @param offsetMS the offset from the current time, in milliseconds, optional.
   *        Use a negative offset for past time, positive for future, zero or unspecified for "current"
   * @return the datetime string in the DTM datetime picker's default format (MM/DD/YYYY HH:MM).
   */
  getCurrentDTMString: function(offsetMS) {
    offsetMS = offsetMS || 0;
    var date = new Date(new Date().getTime() + offsetMS);
    return [
      (101 + date.getMonth()).toString().substr(1),
      (100 + date.getDate()).toString().substr(1),
      (10000 + date.getFullYear()).toString().substr(1)].join('/')
      + ' ' +
      [(100 + date.getHours()).toString().substr(1),
      (100 + date.getMinutes()).toString().substr(1)].join(':');
  },

  /**
   *  Converts a Questionnaire and QuestionnaireResponse into an LFormsData
   *  object, and uses addFormToPage to render it in the specified element.
   * @param q the Questionnaire (parsed)
   * @param qr the QuestionnaireResponse
   * @param elemID the ID of an element into which the form should be shown.
   * @return a promise that resolves when the browser has been instructed to
   *  render the form.
   */
  showQQR: function(q, qr, elemID) {
    return browser.executeScript(() => {
      var q2 = arguments[0];
      var qr2 = arguments[1];
      var elemID = arguments[2];
      var lfd = LForms.Util.convertFHIRQuestionnaireToLForms(q2, 'R4');
      var merged = LForms.Util.mergeFHIRDataIntoLForms(
        'QuestionnaireResponse', qr2, lfd, 'R4');

      // Set a flag so we know when the render is done.
      var formElem = document.getElementById(elemID);
      merged = new LForms.LFormsData(merged);
      LForms.Util.addFormToPage(merged, elemID);
    }, q, qr, elemID);
  },

};

module.exports = util;
