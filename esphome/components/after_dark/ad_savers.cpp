/*
 * ad_savers.cpp - the list of savers in this build. Each saver's own file adds
 * itself with AD_REGISTER_SAVER; the list is kept in name order.
 */
#include "ad_core.h"

#include <cstring>

namespace adcore {

namespace {
/* Constant-initialised, so it is null before any registrar runs. */
SaverEntry *head = nullptr;
}  // namespace

bool (*time_source)(Clock &out) = nullptr;

SaverRegistrar::SaverRegistrar(SaverEntry *e) {
  SaverEntry **p = &head;
  while (*p != nullptr && strcmp((*p)->name, e->name) < 0)
    p = const_cast<SaverEntry **>(&(*p)->next);
  e->next = *p;
  *p = e;
}

const SaverEntry *first_saver() { return head; }

const SaverEntry *find_saver(const char *name) {
  for (const SaverEntry *e = head; e != nullptr; e = e->next)
    if (strcmp(e->name, name) == 0)
      return e;
  return nullptr;
}

}  // namespace adcore
