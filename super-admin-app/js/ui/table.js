/**
 * table.js — Reusable data table builder
 */
var Table = (function () {
  'use strict';

  /**
   * Build a responsive data table.
   * @param {Array} columns - [{ key, label, render? }]
   * @param {Array} data - array of row objects
   * @param {Function} actionsRenderer - optional, receives row, returns DOM element
   * @returns {HTMLElement}
   */
  function build(columns, data, actionsRenderer) {
    var wrap = document.createElement('div');
    wrap.className = 'table-wrap';

    var table = document.createElement('table');
    table.className = 'data-table';

    // Thead
    var thead = document.createElement('thead');
    var trHead = document.createElement('tr');
    columns.forEach(function (col) {
      var th = document.createElement('th');
      th.textContent = col.label;
      trHead.appendChild(th);
    });
    if (actionsRenderer) {
      var th = document.createElement('th');
      th.textContent = 'Actions';
      trHead.appendChild(th);
    }
    thead.appendChild(trHead);
    table.appendChild(thead);

    // Tbody
    var tbody = document.createElement('tbody');
    if (!data || data.length === 0) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = columns.length + (actionsRenderer ? 1 : 0);
      td.className = 'empty-state';
      td.innerHTML = '<div class="empty-state-icon">📋</div><div class="empty-state-text">No data available</div>';
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      data.forEach(function (row) {
        var tr = document.createElement('tr');
        columns.forEach(function (col) {
          var td = document.createElement('td');
          if (col.render) {
            td.innerHTML = col.render(row[col.key], row);
          } else {
            td.textContent = row[col.key] != null ? row[col.key] : '–';
          }
          tr.appendChild(td);
        });
        if (actionsRenderer) {
          var td = document.createElement('td');
          td.appendChild(actionsRenderer(row));
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      });
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  return { build: build };
})();
